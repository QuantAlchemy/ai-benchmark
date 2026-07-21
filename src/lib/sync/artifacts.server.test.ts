import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Header } from "tar";
import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CHUNK_SIZE,
  assertArtifactTarStreamWithinLimit,
  describeArtifactChunks,
  materializeSolutionArtifact,
  packageSolutionArtifact,
} from "./artifacts.server";

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeGzipTar(entries: Array<{ path: string; content: Buffer; mode?: number }>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = new Header({
      path: entry.path,
      type: "File",
      size: entry.content.length,
      mode: entry.mode ?? 0o644,
      uid: 0,
      gid: 0,
      mtime: new Date(0),
    });
    const headerBlock = Buffer.alloc(512);
    header.encode(headerBlock);
    blocks.push(headerBlock, entry.content);
    const remainder = entry.content.length % 512;
    if (remainder !== 0) blocks.push(Buffer.alloc(512 - remainder));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}

describe("solution artifacts", () => {
  it("uses one locale-independent path ordering for packaging and verification", async () => {
    const root = await makeTempDir("artifact-ordering-");
    const solutionDir = join(root, "solution");
    await mkdir(solutionDir);
    await writeFile(join(solutionDir, "a.txt"), "lower\n");
    await writeFile(join(solutionDir, "B.txt"), "upper\n");
    const packaged = await packageSolutionArtifact({
      solutionDir,
      artifactPath: join(root, "artifact.tar.gz"),
    });
    expect(packaged.manifest.files.map((file) => file.path)).toEqual(["B.txt", "a.txt"]);
    await materializeSolutionArtifact({
      artifactPath: packaged.artifactPath,
      expectedArtifactSha256: packaged.artifactSha256,
      destinationDir: join(root, "destination"),
    });
  });

  it("never overwrites an existing artifact path", async () => {
    const root = await makeTempDir("artifact-output-no-overwrite-");
    const solutionDir = join(root, "solution");
    const artifactPath = join(root, "artifact.tar.gz");
    await mkdir(solutionDir);
    await writeFile(join(solutionDir, "answer.txt"), "new\n");
    await writeFile(artifactPath, "existing artifact\n");
    await expect(packageSolutionArtifact({ solutionDir, artifactPath })).rejects.toThrow();
    expect(await readFile(artifactPath, "utf8")).toBe("existing artifact\n");
  });

  it("bounds total decompressed tar bytes including metadata and padding", async () => {
    const root = await makeTempDir("artifact-tar-bound-");
    const artifactPath = join(root, "oversized-metadata.tar.gz");
    await writeFile(artifactPath, gzipSync(Buffer.alloc(1024 * 1024)));
    await expect(assertArtifactTarStreamWithinLimit(artifactPath, 1024)).rejects.toThrow(
      "Artifact tar stream exceeds the expanded size limit",
    );
  });

  it("packages and materializes a deterministic roundtrip with a complete manifest", async () => {
    const root = await makeTempDir("artifact-roundtrip-");
    const solutionDir = join(root, "solution");
    await mkdir(join(solutionDir, "source", "nested"), { recursive: true });
    await mkdir(join(solutionDir, "assets"), { recursive: true });
    await mkdir(join(solutionDir, "dist"), { recursive: true });
    await writeFile(join(solutionDir, "source", "nested", "main.ts"), "export const answer = 42;\n");
    await writeFile(join(solutionDir, "assets", "sprite.bin"), Buffer.from([0, 1, 2, 3]));
    await writeFile(join(solutionDir, "dist", "app.js"), "console.log('built');\n");
    await writeFile(join(solutionDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await chmod(join(solutionDir, "source", "nested", "main.ts"), 0o640);

    const firstPath = join(root, "first.tar.gz");
    const secondPath = join(root, "second.tar.gz");
    const first = await packageSolutionArtifact({ solutionDir, artifactPath: firstPath });

    await utimes(join(solutionDir, "source", "nested", "main.ts"), new Date(1_700_000_000_000), new Date());
    const second = await packageSolutionArtifact({ solutionDir, artifactPath: secondPath });

    expect(first.artifactPath).toBe(resolve(firstPath));
    expect(first.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(second.artifactSha256).toBe(first.artifactSha256);
    expect(await readFile(secondPath)).toEqual(await readFile(firstPath));
    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.files.map((file) => file.path)).toEqual([
      "assets/sprite.bin",
      "dist/app.js",
      "pnpm-lock.yaml",
      "source/nested/main.ts",
    ]);
    expect(first.manifest.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "source/nested/main.ts",
          size: 26,
          mode: 0o640,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
    expect(first.manifest.totalExpandedBytes).toBe(4 + 22 + 23 + 26);

    const destinationDir = join(root, "materialized");
    await materializeSolutionArtifact({
      artifactPath: first.artifactPath,
      expectedArtifactSha256: first.artifactSha256,
      destinationDir,
    });

    expect(await readFile(join(destinationDir, "source", "nested", "main.ts"), "utf8")).toBe(
      "export const answer = 42;\n",
    );
    expect((await stat(join(destinationDir, "source", "nested", "main.ts"))).mode & 0o777).toBe(0o640);
  });

  it("excludes repositories, dependencies, caches, logs, environment files, and secret-bearing config", async () => {
    const root = await makeTempDir("artifact-exclusions-");
    const solutionDir = join(root, "solution");
    const files: Record<string, string> = {
      "source/index.ts": "export {};\n",
      "assets/keep.txt": "asset\n",
      "dist/keep.js": "built\n",
      "package-lock.json": "{}\n",
      ".git/config": "secret\n",
      "node_modules/module/index.js": "dependency\n",
      ".cache/result": "cache\n",
      "logs/debug.log": "log\n",
      "logs/trace.txt": "log output\n",
      ".env": "TOKEN=secret\n",
      ".env.local": "TOKEN=secret\n",
      ".envrc": "export TOKEN=secret\n",
      ".npmrc": "//registry/:_authToken=secret\n",
      ".ssh/config": "Host *\n  IdentityFile id_rsa\n",
      ".aws/config": "aws_access_key_id = secret\n",
      ".docker/config.json": "{\"auths\":{\"registry\":{\"auth\":\"dXNlcjpwYXNz\"}}}\n",
      ".kube/config": "users:\n- token: secret\n",
      "auth.json": "{\"accessToken\":\"production-secret-token\"}\n",
      "id_ed25519": "private key\n",
      "signing.pem": "private key\n",
    };
    for (const [path, content] of Object.entries(files)) {
      const absolutePath = join(solutionDir, ...path.split("/"));
      await mkdir(join(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, content);
    }

    const packaged = await packageSolutionArtifact({
      solutionDir,
      artifactPath: join(root, "artifact.tar.gz"),
    });

    expect(packaged.manifest.files.map((file) => file.path)).toEqual([
      "assets/keep.txt",
      "dist/keep.js",
      "package-lock.json",
      "source/index.ts",
    ]);
  });

  it("fails closed for unknown file types and secret-bearing portable files", async () => {
    const root = await makeTempDir("artifact-allowlist-");
    const solutionDir = join(root, "solution");
    await mkdir(join(solutionDir, "src"), { recursive: true });
    await writeFile(join(solutionDir, "src", "main.ts"), "export {};\n");
    await writeFile(join(solutionDir, "history.sqlite"), "opaque database bytes\n");
    await expect(
      packageSolutionArtifact({ solutionDir, artifactPath: join(root, "unknown.tar.gz") }),
    ).rejects.toThrow("Unsupported portable artifact file type: history.sqlite");

    await rm(join(solutionDir, "history.sqlite"));
    await writeFile(join(solutionDir, "deploy.config.json"), JSON.stringify({ apiToken: "production-secret-token" }));
    await expect(
      packageSolutionArtifact({ solutionDir, artifactPath: join(root, "secret.tar.gz") }),
    ).rejects.toThrow("Secret-bearing file cannot be synchronized: deploy.config.json");
  });

  it("normalizes writable source modes to the safe portable mode recorded in the manifest", async () => {
    const root = await makeTempDir("artifact-mode-");
    const solutionDir = join(root, "solution");
    await mkdir(solutionDir);
    const sourcePath = join(solutionDir, "writable.txt");
    await writeFile(sourcePath, "content\n");
    await chmod(sourcePath, 0o664);

    const packaged = await packageSolutionArtifact({
      solutionDir,
      artifactPath: join(root, "artifact.tar.gz"),
    });

    expect(packaged.manifest.files[0]?.mode).toBe(0o644);
    const destinationDir = join(root, "destination");
    await materializeSolutionArtifact({
      artifactPath: packaged.artifactPath,
      expectedArtifactSha256: packaged.artifactSha256,
      destinationDir,
    });
    expect((await stat(join(destinationDir, "writable.txt"))).mode & 0o777).toBe(0o644);
  });

  it("describes an artifact in fixed 8 MiB SHA-256 chunks", async () => {
    const root = await makeTempDir("artifact-chunks-");
    const artifactPath = join(root, "artifact.bin");
    const firstChunk = Buffer.alloc(ARTIFACT_CHUNK_SIZE, 0x5a);
    const finalChunk = Buffer.from("final chunk\n");
    await writeFile(artifactPath, Buffer.concat([firstChunk, finalChunk]));

    expect(await describeArtifactChunks(artifactPath)).toEqual([
      { index: 0, offset: 0, size: ARTIFACT_CHUNK_SIZE, sha256: sha256(firstChunk) },
      {
        index: 1,
        offset: ARTIFACT_CHUNK_SIZE,
        size: finalChunk.length,
        sha256: sha256(finalChunk),
      },
    ]);
  });

  it("rejects a corrupted artifact before materializing files", async () => {
    const root = await makeTempDir("artifact-corruption-");
    const solutionDir = join(root, "solution");
    await mkdir(solutionDir);
    await writeFile(join(solutionDir, "answer.txt"), "correct\n");
    const packaged = await packageSolutionArtifact({
      solutionDir,
      artifactPath: join(root, "artifact.tar.gz"),
    });
    const corrupted = await readFile(packaged.artifactPath);
    corrupted[Math.floor(corrupted.length / 2)]! ^= 0xff;
    await writeFile(packaged.artifactPath, corrupted);

    const destinationDir = join(root, "destination");
    await expect(
      materializeSolutionArtifact({
        artifactPath: packaged.artifactPath,
        expectedArtifactSha256: packaged.artifactSha256,
        destinationDir,
      }),
    ).rejects.toThrow("Artifact SHA-256 mismatch");
    await expect(stat(destinationDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects traversal paths even when the bundle checksum is valid", async () => {
    const root = await makeTempDir("artifact-traversal-");
    const artifactPath = join(root, "traversal.tar.gz");
    const artifact = makeGzipTar([{ path: "../escape.txt", content: Buffer.from("escaped\n") }]);
    await writeFile(artifactPath, artifact);

    await expect(
      materializeSolutionArtifact({
        artifactPath,
        expectedArtifactSha256: sha256(artifact),
        destinationDir: join(root, "destination"),
      }),
    ).rejects.toThrow("Unsafe artifact path");
    await expect(stat(join(root, "escape.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects group or world-writable modes from remote artifact manifests", async () => {
    const root = await makeTempDir("artifact-writable-mode-");
    const artifactPath = join(root, "writable-mode.tar.gz");
    const content = Buffer.from("actual\n");
    const manifest = Buffer.from(
      `${JSON.stringify({
        version: 1,
        files: [{ path: "source.txt", size: content.length, mode: 0o666, sha256: sha256(content) }],
        totalExpandedBytes: content.length,
      })}\n`,
    );
    const artifact = makeGzipTar([
      { path: ".ai-benchmark-artifact-manifest.json", content: manifest, mode: 0o600 },
      { path: "source.txt", content, mode: 0o666 },
    ]);
    await writeFile(artifactPath, artifact);

    await expect(
      materializeSolutionArtifact({
        artifactPath,
        expectedArtifactSha256: sha256(artifact),
        destinationDir: join(root, "destination"),
      }),
    ).rejects.toThrow("Unsafe artifact mode: source.txt");
  });

  it("rejects archive contents that do not match every manifest field", async () => {
    const root = await makeTempDir("artifact-manifest-");
    const artifactPath = join(root, "mismatch.tar.gz");
    const content = Buffer.from("actual\n");
    const manifest = Buffer.from(
      `${JSON.stringify({
        version: 1,
        files: [{ path: "source.txt", size: content.length, mode: 0o644, sha256: "0".repeat(64) }],
        totalExpandedBytes: content.length,
      })}\n`,
    );
    const artifact = makeGzipTar([
      { path: ".ai-benchmark-artifact-manifest.json", content: manifest, mode: 0o600 },
      { path: "source.txt", content, mode: 0o644 },
    ]);
    await writeFile(artifactPath, artifact);

    await expect(
      materializeSolutionArtifact({
        artifactPath,
        expectedArtifactSha256: sha256(artifact),
        destinationDir: join(root, "destination"),
      }),
    ).rejects.toThrow("Artifact manifest mismatch: source.txt");
  });

  it("rejects unsupported symlinks while packaging", async () => {
    const root = await makeTempDir("artifact-symlink-");
    const solutionDir = join(root, "solution");
    await mkdir(solutionDir);
    await writeFile(join(solutionDir, "target.txt"), "target\n");
    await symlink("target.txt", join(solutionDir, "link.txt"));

    await expect(
      packageSolutionArtifact({ solutionDir, artifactPath: join(root, "artifact.tar.gz") }),
    ).rejects.toThrow("Unsupported artifact entry type: link.txt");
  });

  it("never overwrites a nonempty materialization destination", async () => {
    const root = await makeTempDir("artifact-no-overwrite-");
    const solutionDir = join(root, "solution");
    await mkdir(solutionDir);
    await writeFile(join(solutionDir, "new.txt"), "new\n");
    const packaged = await packageSolutionArtifact({
      solutionDir,
      artifactPath: join(root, "artifact.tar.gz"),
    });
    const destinationDir = join(root, "destination");
    await mkdir(destinationDir);
    await writeFile(join(destinationDir, "sentinel.txt"), "keep\n");

    await expect(
      materializeSolutionArtifact({
        artifactPath: packaged.artifactPath,
        expectedArtifactSha256: packaged.artifactSha256,
        destinationDir,
      }),
    ).rejects.toThrow();
    expect(await readFile(join(destinationDir, "sentinel.txt"), "utf8")).toBe("keep\n");
    await expect(stat(join(destinationDir, "new.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never overwrites an existing empty destination", async () => {
    const root = await makeTempDir("artifact-empty-destination-");
    const solutionDir = join(root, "solution");
    await mkdir(solutionDir);
    await writeFile(join(solutionDir, "new.txt"), "new\n");
    const packaged = await packageSolutionArtifact({
      solutionDir,
      artifactPath: join(root, "artifact.tar.gz"),
    });
    const destinationDir = join(root, "destination");
    await mkdir(destinationDir);

    await expect(
      materializeSolutionArtifact({
        artifactPath: packaged.artifactPath,
        expectedArtifactSha256: packaged.artifactSha256,
        destinationDir,
      }),
    ).rejects.toThrow();
    await expect(stat(join(destinationDir, "new.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
