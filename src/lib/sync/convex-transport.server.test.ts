import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PackagedSolutionArtifact } from "./artifacts.server";
import { ConvexHttpSyncTransport } from "./convex-transport.server";

const temporaryRoots: string[] = [];
const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "convex-transport-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Convex HTTP sync transport", () => {
  it("binds the bearer token to the expected local client identity", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ok: true, currentSequence: 0, clientId: "11111111-1111-4111-8111-111111111111" }),
    );
    const transport = new ConvexHttpSyncTransport({
      baseUrl: "https://example.convex.site",
      clientToken: "opaque-token",
      fetch,
    });

    await expect(transport.verifyAuthenticatedClient("11111111-1111-4111-8111-111111111111")).resolves.toBeUndefined();
    await expect(transport.verifyAuthenticatedClient("22222222-2222-4222-8222-222222222222")).rejects.toThrow(
      "does not match",
    );
  });

  it("authenticates and maps local push/pull operations to the HTTP ledger protocol", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/api/sync/runs/push")) return Response.json({ sequence: 7, duplicate: false });
      return Response.json({
        events: [
          {
            sequence: 8,
            operationId: "22222222-2222-4222-8222-222222222222",
            runUid: "33333333-3333-4333-8333-333333333333",
            eventKind: "tombstone",
            payloadJson: '{"version":1}',
            actorClientId: "44444444-4444-4444-8444-444444444444",
            createdAt: 1_700_000_000_000,
          },
        ],
        nextAfter: 8,
        currentSequence: 9,
        hasMore: true,
      });
    });
    const transport = new ConvexHttpSyncTransport({
      baseUrl: "https://example.convex.site/",
      clientToken: "opaque-token",
      fetch,
    });

    await expect(
      transport.pushOperation({
        operationId: "11111111-1111-4111-8111-111111111111",
        runUid: "33333333-3333-4333-8333-333333333333",
        operationType: "upsert",
        payloadJson: `{"version":1,"run":{"artifactDigest":"${"a".repeat(64)}"}}`,
      }),
    ).resolves.toEqual({ sequence: 7 });
    await expect(transport.pullEvents(7, 100)).resolves.toEqual({
      events: [
        {
          sequence: 8,
          operationId: "22222222-2222-4222-8222-222222222222",
          runUid: "33333333-3333-4333-8333-333333333333",
          operationType: "delete",
          payloadJson: '{"version":1}',
          actorClientId: "44444444-4444-4444-8444-444444444444",
          createdAt: new Date(1_700_000_000_000).toISOString(),
        },
      ],
      latestSequence: 9,
    });

    expect(requests).toHaveLength(2);
    expect(requests.every(({ init }) => new Headers(init.headers).get("Authorization") === "Bearer opaque-token")).toBe(true);
    expect(JSON.parse(String(requests[0]!.init.body))).toMatchObject({
      eventKind: "snapshot",
      artifactDigest: "a".repeat(64),
    });
    expect(requests[1]!.url).toBe("https://example.convex.site/api/sync/runs/pull?after=7&limit=100");
  });

  it("uploads immutable artifact chunks and finalizes their manifest", async () => {
    const root = await temporaryRoot();
    const bytes = Buffer.from("artifact bytes\n");
    const artifactPath = join(root, "artifact.tar.gz");
    await writeFile(artifactPath, bytes);
    let finalized: Record<string, unknown> | undefined;
    const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith("/api/sync/artifacts/upload-url")) {
        expect(new Headers(init.headers).get("Authorization")).toBe("Bearer opaque-token");
        return Response.json({ uploadUrl: "https://uploads.example/chunk" });
      }
      if (url === "https://uploads.example/chunk") {
        expect(Buffer.from(await new Response(init.body).arrayBuffer())).toEqual(bytes);
        return Response.json({ storageId: "storage-id" });
      }
      finalized = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({ digest: digest(bytes), created: true });
    });
    const transport = new ConvexHttpSyncTransport({
      baseUrl: "https://example.convex.site",
      clientToken: "opaque-token",
      fetch,
    });
    const artifact: PackagedSolutionArtifact = {
      artifactPath,
      artifactSha256: digest(bytes),
      artifactSize: bytes.length,
      manifest: {
        version: 1,
        files: [{ path: "src/main.ts", size: 1, mode: 0o644, sha256: "a".repeat(64) }],
        totalExpandedBytes: 1,
      },
      chunks: [{ index: 0, offset: 0, size: bytes.length, sha256: digest(bytes) }],
    };

    await transport.uploadArtifact(artifact);
    expect(finalized).toEqual({
      digest: artifact.artifactSha256,
      sizeBytes: bytes.length,
      manifestJson: JSON.stringify(artifact.manifest),
      chunks: [{ index: 0, storageId: "storage-id", sizeBytes: bytes.length, sha256: digest(bytes) }],
    });
  });

  it("downloads authenticated chunks and verifies chunk and whole-artifact integrity", async () => {
    const root = await temporaryRoot();
    const first = Buffer.from("first-");
    const second = Buffer.from("second");
    const bytes = Buffer.concat([first, second]);
    const manifest = { version: 1 as const, files: [], totalExpandedBytes: 0 };
    const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer opaque-token");
      if (/\/chunks\/0$/.test(url)) return new Response(first);
      if (/\/chunks\/1$/.test(url)) return new Response(second);
      return Response.json({
        artifactDigest: digest(bytes),
        artifactSize: bytes.length,
        manifestJson: JSON.stringify(manifest),
        chunks: [
          { index: 0, sizeBytes: first.length, sha256: digest(first) },
          { index: 1, sizeBytes: second.length, sha256: digest(second) },
        ],
      });
    });
    const transport = new ConvexHttpSyncTransport({
      baseUrl: "https://example.convex.site",
      clientToken: "opaque-token",
      fetch,
    });
    const destinationPath = join(root, "download.tar.gz");

    await expect(transport.downloadArtifact(digest(bytes), destinationPath)).resolves.toEqual({
      artifactDigest: digest(bytes),
      artifactSize: bytes.length,
      manifest,
      chunks: [
        { index: 0, offset: 0, size: first.length, sha256: digest(first) },
        { index: 1, offset: first.length, size: second.length, sha256: digest(second) },
      ],
    });
    expect(await readFile(destinationPath)).toEqual(bytes);
  });

  it("rejects malformed remote manifest entries before downloading artifact chunks", async () => {
    const root = await temporaryRoot();
    const bytes = Buffer.from("archive");
    const fetch = vi.fn(async () =>
      Response.json({
        artifactDigest: digest(bytes),
        artifactSize: bytes.length,
        manifestJson: JSON.stringify({
          version: 1,
          files: [{ path: "../escape", size: 7, mode: 0o644, sha256: digest(bytes) }],
          totalExpandedBytes: 7,
        }),
        chunks: [{ index: 0, sizeBytes: bytes.length, sha256: digest(bytes) }],
      }),
    );
    const transport = new ConvexHttpSyncTransport({
      baseUrl: "https://example.convex.site",
      clientToken: "opaque-token",
      fetch,
    });

    await expect(transport.downloadArtifact(digest(bytes), join(root, "download.tar.gz"))).rejects.toThrow(
      "Invalid Convex artifact manifest",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
