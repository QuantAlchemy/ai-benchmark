import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  link,
  mkdir,
  mkdtemp,
  opendir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { createGunzip } from "node:zlib";
import * as tar from "tar";

export const ARTIFACT_CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_ARTIFACT_CHUNKS = 64;
export const MAX_ARTIFACT_BYTES = ARTIFACT_CHUNK_SIZE * MAX_ARTIFACT_CHUNKS;
export const MAX_ARTIFACT_FILES = 100_000;
export const MAX_ARTIFACT_FILE_BYTES = 512 * 1024 * 1024;
export const MAX_ARTIFACT_EXPANDED_BYTES = 1024 * 1024 * 1024;
const MAX_ARTIFACT_TAR_STREAM_BYTES =
  MAX_ARTIFACT_EXPANDED_BYTES + (MAX_ARTIFACT_FILES + 2) * 1024;

const MANIFEST_PATH = ".ai-benchmark-artifact-manifest.json";
const HEX_SHA256 = /^[a-f0-9]{64}$/;

export interface ArtifactManifestFile {
  path: string;
  size: number;
  mode: number;
  sha256: string;
}

export interface ArtifactManifest {
  version: 1;
  files: ArtifactManifestFile[];
  totalExpandedBytes: number;
}

export interface ArtifactChunkDescriptor {
  index: number;
  offset: number;
  size: number;
  sha256: string;
}

export interface PackagedSolutionArtifact {
  artifactPath: string;
  artifactSha256: string;
  artifactSize: number;
  manifest: ArtifactManifest;
  chunks: ArtifactChunkDescriptor[];
}

export interface PackageSolutionArtifactOptions {
  solutionDir: string;
  artifactPath: string;
}

export interface MaterializeSolutionArtifactOptions {
  artifactPath: string;
  expectedArtifactSha256: string;
  destinationDir: string;
}

function toArchivePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function normalizePortableMode(mode: number): number {
  return ((mode & 0o777) | 0o600) & ~0o022;
}

function comparePortablePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const PORTABLE_FILE_EXTENSIONS = new Set([
  ".avif", ".bash", ".bin", ".bmp", ".c", ".cc", ".cjs", ".conf", ".cpp", ".css", ".csv",
  ".data", ".frag", ".gif", ".glb", ".gltf", ".go", ".h", ".hpp", ".htm", ".html", ".ico",
  ".ini", ".java", ".jpeg", ".jpg", ".js", ".json", ".jsonc", ".jsx", ".kt", ".less", ".lock",
  ".lua", ".m4a", ".map", ".md", ".mjs", ".mp3", ".mp4", ".mtl", ".obj", ".ogg", ".otf", ".php",
  ".png", ".ps1", ".py", ".rb", ".rs", ".sass", ".scss", ".sh", ".svg", ".toml", ".ts", ".tsx",
  ".ttf", ".txt", ".vert", ".wasm", ".wav", ".webm", ".webmanifest", ".webp", ".wgsl", ".woff",
  ".woff2", ".xcf", ".xml", ".yaml", ".yml", ".zsh",
]);

const PORTABLE_EXTENSIONLESS_FILES = new Set([
  ".browserslistrc",
  ".editorconfig",
  ".eslintignore",
  ".eslintrc",
  ".gitignore",
  ".prettierignore",
  ".prettierrc",
  ".stylelintrc",
  "cmakelists.txt",
  "dockerfile",
  "license",
  "makefile",
  "notice",
  "procfile",
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".bash", ".c", ".cc", ".cjs", ".conf", ".cpp", ".css", ".csv", ".frag", ".go", ".h", ".hpp",
  ".htm", ".html", ".ini", ".java", ".js", ".json", ".jsonc", ".jsx", ".kt", ".less", ".lock",
  ".lua", ".mjs", ".md", ".php", ".ps1", ".py", ".rb", ".rs", ".sass", ".scss", ".sh", ".svg",
  ".toml", ".ts", ".tsx", ".txt", ".vert", ".webmanifest", ".wgsl", ".xml", ".yaml", ".yml", ".zsh",
]);

function validatePortableFileType(path: string): void {
  const base = path.split("/").at(-1)?.toLowerCase() ?? "";
  const extension = posix.extname(base);
  if (!PORTABLE_FILE_EXTENSIONS.has(extension) && !PORTABLE_EXTENSIONLESS_FILES.has(base)) {
    throw new Error(`Unsupported portable artifact file type: ${path}`);
  }
}

function excludedPath(path: string): boolean {
  const segments = path.split("/");
  const base = segments.at(-1)?.toLowerCase() ?? "";
  return (
    segments.some((segment) =>
      [
        ".git",
        "node_modules",
        ".cache",
        "cache",
        "caches",
        "log",
        "logs",
        "coverage",
        ".next",
        ".turbo",
        ".ssh",
        ".aws",
        ".gnupg",
        ".docker",
        ".kube",
        ".azure",
        ".gcloud",
        ".terraform",
        ".serverless",
        ".vercel",
      ].includes(segment.toLowerCase()),
    ) ||
    base === MANIFEST_PATH ||
    base === ".env" ||
    base === ".envrc" ||
    base.startsWith(".env.") ||
    base.endsWith(".log") ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base.endsWith(".p12") ||
    base.endsWith(".pfx") ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i.test(base) ||
    [".npmrc", ".pypirc", ".netrc", ".htpasswd"].includes(base) ||
    /(?:secret|credential|auth(?:entication|orization)?|service[-_]?account)/i.test(base)
  );
}

async function isSecretBearingFile(path: string, absolutePath: string, size: number): Promise<boolean> {
  const base = path.split("/").at(-1)?.toLowerCase() ?? "";
  const extension = posix.extname(base);
  if (size > 1024 * 1024 || (!TEXT_FILE_EXTENSIONS.has(extension) && !PORTABLE_EXTENSIONLESS_FILES.has(base))) {
    return false;
  }
  const content = await readFile(absolutePath, "utf8");
  if (content.includes("\0")) return false;
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content) ||
    /["']?(?:api[-_]?key|api[-_]?token|access[-_]?token|auth[-_]?token|password|passwd|secret)["']?\s*[:=]\s*["']?(?!\$\{|process\.env|env\.|<|example|changeme|redacted)[A-Za-z0-9_./+=-]{8,}/i.test(content)
  );
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function discoverFiles(root: string): Promise<ArtifactManifestFile[]> {
  const files: ArtifactManifestFile[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = [];
    for await (const entry of await opendir(directory)) entries.push(entry);
    entries.sort((left, right) => comparePortablePaths(left.name, right.name));

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const archivePath = toArchivePath(root, absolutePath);
      if (excludedPath(archivePath)) continue;

      const info = await lstat(absolutePath);
      if (info.isDirectory()) {
        await visit(absolutePath);
      } else if (info.isFile()) {
        if (info.size > MAX_ARTIFACT_FILE_BYTES) throw new Error(`Artifact file is too large: ${archivePath}`);
        validatePortableFileType(archivePath);
        if (await isSecretBearingFile(archivePath, absolutePath, info.size)) {
          throw new Error(`Secret-bearing file cannot be synchronized: ${archivePath}`);
        }
        files.push({
          path: archivePath,
          size: info.size,
          mode: normalizePortableMode(info.mode),
          sha256: await sha256File(absolutePath),
        });
      } else {
        throw new Error(`Unsupported artifact entry type: ${archivePath}`);
      }
    }
  }

  await visit(root);
  if (files.length > MAX_ARTIFACT_FILES) throw new Error("Artifact contains too many files");
  return files.sort((left, right) => comparePortablePaths(left.path, right.path));
}

export async function assertArtifactTarStreamWithinLimit(
  artifactPath: string,
  maxBytes = MAX_ARTIFACT_TAR_STREAM_BYTES,
): Promise<void> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("Invalid artifact tar stream limit");
  const stream = createReadStream(artifactPath).pipe(createGunzip());
  let bytes = 0;
  try {
    for await (const value of stream) {
      bytes += (value as Buffer).length;
      if (bytes > maxBytes) {
        stream.destroy();
        throw new Error("Artifact tar stream exceeds the expanded size limit");
      }
    }
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

function validateSafePath(path: string): void {
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    isAbsolute(path) ||
    posix.isAbsolute(path) ||
    /^[A-Za-z]:\//.test(path) ||
    posix.normalize(path) !== path ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe artifact path: ${path}`);
  }
}

function parseManifest(value: unknown): ArtifactManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid artifact manifest");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !== "files,totalExpandedBytes,version" ||
    record.version !== 1 ||
    !Array.isArray(record.files) ||
    !Number.isSafeInteger(record.totalExpandedBytes) ||
    (record.totalExpandedBytes as number) < 0
  ) {
    throw new Error("Invalid artifact manifest");
  }
  if (record.files.length > MAX_ARTIFACT_FILES) throw new Error("Artifact contains too many files");

  const files = record.files.map((value, index): ArtifactManifestFile => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Invalid artifact manifest file at index ${index}`);
    }
    const file = value as Record<string, unknown>;
    if (
      Object.keys(file).sort().join(",") !== "mode,path,sha256,size" ||
      typeof file.path !== "string" ||
      !Number.isSafeInteger(file.size) ||
      (file.size as number) < 0 ||
      (file.size as number) > MAX_ARTIFACT_FILE_BYTES ||
      !Number.isSafeInteger(file.mode) ||
      (file.mode as number) < 0 ||
      (file.mode as number) > 0o777 ||
      typeof file.sha256 !== "string" ||
      !HEX_SHA256.test(file.sha256)
    ) {
      throw new Error(`Invalid artifact manifest file at index ${index}`);
    }
    if ((file.mode as number) & 0o022) throw new Error(`Unsafe artifact mode: ${file.path}`);
    validateSafePath(file.path);
    return file as unknown as ArtifactManifestFile;
  });

  const paths = files.map((file) => file.path);
  if (paths.some((path, index) => index > 0 && path <= paths[index - 1]!)) {
    throw new Error("Artifact manifest paths must be unique and sorted");
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total !== record.totalExpandedBytes || total > MAX_ARTIFACT_EXPANDED_BYTES) {
    throw new Error("Invalid artifact manifest expanded size");
  }
  return { version: 1, files, totalExpandedBytes: total };
}

export async function describeArtifactChunks(artifactPath: string): Promise<ArtifactChunkDescriptor[]> {
  const size = (await stat(artifactPath)).size;
  if (size > MAX_ARTIFACT_BYTES) throw new Error("Artifact exceeds the 512 MiB compressed size limit");

  const chunks: ArtifactChunkDescriptor[] = [];
  const stream = createReadStream(artifactPath, { highWaterMark: ARTIFACT_CHUNK_SIZE });
  let offset = 0;
  for await (const value of stream) {
    const chunk = value as Buffer;
    chunks.push({
      index: chunks.length,
      offset,
      size: chunk.length,
      sha256: createHash("sha256").update(chunk).digest("hex"),
    });
    offset += chunk.length;
  }
  if (chunks.length > MAX_ARTIFACT_CHUNKS) throw new Error("Artifact contains too many chunks");
  return chunks;
}

export async function packageSolutionArtifact({
  solutionDir,
  artifactPath,
}: PackageSolutionArtifactOptions): Promise<PackagedSolutionArtifact> {
  const sourceRoot = resolve(solutionDir);
  const outputPath = resolve(artifactPath);
  const sourceInfo = await stat(sourceRoot);
  if (!sourceInfo.isDirectory()) throw new Error("Solution path must be a directory");

  const files = await discoverFiles(sourceRoot);
  const totalExpandedBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalExpandedBytes > MAX_ARTIFACT_EXPANDED_BYTES) throw new Error("Artifact expanded size limit exceeded");
  const manifest: ArtifactManifest = { version: 1, files, totalExpandedBytes };

  await mkdir(dirname(outputPath), { recursive: true });
  const stagingRoot = await mkdtemp(join(dirname(outputPath), ".artifact-stage-"));
  const temporaryArtifactPath = join(dirname(outputPath), `.artifact-${process.pid}-${Date.now()}.tmp`);
  try {
    for (const file of files) {
      const stagedPath = join(stagingRoot, ...file.path.split("/"));
      await mkdir(dirname(stagedPath), { recursive: true });
      await copyFile(join(sourceRoot, ...file.path.split("/")), stagedPath, constants.COPYFILE_EXCL);
      const stagedInfo = await stat(stagedPath);
      if (stagedInfo.size !== file.size || (await sha256File(stagedPath)) !== file.sha256) {
        throw new Error(`Solution changed while packaging: ${file.path}`);
      }
      await chmod(stagedPath, file.mode);
    }
    await writeFile(join(stagingRoot, MANIFEST_PATH), `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
    await tar.create(
      {
        cwd: stagingRoot,
        file: temporaryArtifactPath,
        gzip: { level: 9 },
        noMtime: true,
        portable: true,
        strict: true,
      },
      [MANIFEST_PATH, ...files.map((file) => file.path)],
    );
    const artifactSize = (await stat(temporaryArtifactPath)).size;
    if (artifactSize > MAX_ARTIFACT_BYTES) throw new Error("Artifact exceeds the 512 MiB compressed size limit");
    const artifactSha256 = await sha256File(temporaryArtifactPath);
    const chunks = await describeArtifactChunks(temporaryArtifactPath);
    await link(temporaryArtifactPath, outputPath);
    return { artifactPath: outputPath, artifactSha256, artifactSize, manifest, chunks };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(temporaryArtifactPath, { force: true });
  }
}

interface VerifiedArtifact {
  manifest: ArtifactManifest;
  artifactSha256: string;
}

async function verifySolutionArtifact(
  artifactPath: string,
  expectedArtifactSha256: string,
): Promise<VerifiedArtifact> {
  if (!HEX_SHA256.test(expectedArtifactSha256)) throw new Error("Invalid expected artifact SHA-256");
  const info = await stat(artifactPath);
  if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) throw new Error("Invalid artifact file");
  const artifactSha256 = await sha256File(artifactPath);
  if (artifactSha256 !== expectedArtifactSha256) throw new Error("Artifact SHA-256 mismatch");
  await assertArtifactTarStreamWithinLimit(artifactPath);

  const entries = new Map<string, { size: number; mode: number; sha256: string; content?: Buffer }>();
  const claimedPaths = new Set<string>();
  const entryTasks: Promise<void>[] = [];
  let entryCount = 0;
  let expandedBytes = 0;
  let validationError: Error | null = null;
  await tar.list({
    file: artifactPath,
    strict: true,
    maxDecompressionRatio: 100,
    onReadEntry(entry) {
      if (validationError) {
        entry.resume();
        return;
      }
      try {
        entryCount += 1;
        if (entryCount > MAX_ARTIFACT_FILES + 1) throw new Error("Artifact contains too many files");
        validateSafePath(entry.path);
        if (claimedPaths.has(entry.path)) throw new Error(`Duplicate artifact path: ${entry.path}`);
        claimedPaths.add(entry.path);
        if (entry.type !== "File" && entry.type !== "OldFile") {
          throw new Error(`Unsupported archive entry type: ${entry.type}`);
        }
        if (entry.size > MAX_ARTIFACT_FILE_BYTES) throw new Error(`Artifact entry is too large: ${entry.path}`);
        if (entry.path === MANIFEST_PATH && entry.size > 16 * 1024 * 1024) {
          throw new Error("Artifact manifest is too large");
        }
        if (entry.path !== MANIFEST_PATH) {
          expandedBytes += entry.size;
          if (expandedBytes > MAX_ARTIFACT_EXPANDED_BYTES) {
            throw new Error("Artifact expanded size limit exceeded");
          }
        }
        const entryMode = entry.mode;
        if (typeof entryMode !== "number") throw new Error(`Unsafe artifact mode: ${entry.path}`);
        if (!Number.isSafeInteger(entryMode) || entryMode < 0 || entryMode > 0o777 || (entryMode & 0o022) !== 0) {
          throw new Error(`Unsafe artifact mode: ${entry.path}`);
        }
        const task = (async () => {
          const hash = createHash("sha256");
          const buffers: Buffer[] = [];
          let bytes = 0;
          for await (const value of entry) {
            const buffer = Buffer.from(value as Buffer);
            bytes += buffer.length;
            if (bytes > MAX_ARTIFACT_FILE_BYTES) throw new Error(`Artifact entry is too large: ${entry.path}`);
            hash.update(buffer);
            if (entry.path === MANIFEST_PATH) buffers.push(buffer);
          }
          if (bytes !== entry.size) throw new Error(`Artifact entry size mismatch: ${entry.path}`);
          entries.set(entry.path, {
            size: bytes,
            mode: entryMode,
            sha256: hash.digest("hex"),
            content: entry.path === MANIFEST_PATH ? Buffer.concat(buffers) : undefined,
          });
        })();
        entryTasks.push(task);
      } catch (error) {
        validationError = error instanceof Error ? error : new Error(String(error));
        entry.resume();
      }
    },
  });
  if (validationError) throw validationError;
  await Promise.all(entryTasks);

  const manifestEntry = entries.get(MANIFEST_PATH);
  if (!manifestEntry?.content) throw new Error("Artifact manifest is missing");
  let decoded: unknown;
  try {
    decoded = JSON.parse(manifestEntry.content.toString("utf8"));
  } catch {
    throw new Error("Invalid artifact manifest JSON");
  }
  const manifest = parseManifest(decoded);
  if (entries.size !== manifest.files.length + 1) throw new Error("Artifact contains unmanifested entries");
  for (const file of manifest.files) {
    const entry = entries.get(file.path);
    if (!entry) throw new Error(`Artifact entry is missing: ${file.path}`);
    if (entry.size !== file.size || entry.mode !== file.mode || entry.sha256 !== file.sha256) {
      throw new Error(`Artifact manifest mismatch: ${file.path}`);
    }
  }
  return { manifest, artifactSha256 };
}

export async function materializeSolutionArtifact({
  artifactPath,
  expectedArtifactSha256,
  destinationDir,
}: MaterializeSolutionArtifactOptions): Promise<void> {
  const sourcePath = resolve(artifactPath);
  const destinationPath = resolve(destinationDir);
  await mkdir(dirname(destinationPath), { recursive: true });
  try {
    await lstat(destinationPath);
    throw new Error(`Materialization destination already exists: ${destinationPath}`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }

  const temporaryRoot = await mkdtemp(join(dirname(destinationPath), `.${posix.basename(destinationPath)}.tmp-`));
  const privateArtifactPath = join(temporaryRoot, "artifact.tar.gz");
  const temporaryDirectory = join(temporaryRoot, "solution");
  try {
    await copyFile(sourcePath, privateArtifactPath, constants.COPYFILE_EXCL);
    await verifySolutionArtifact(privateArtifactPath, expectedArtifactSha256);
    await mkdir(temporaryDirectory, { mode: 0o700 });
    await tar.extract({
      cwd: temporaryDirectory,
      file: privateArtifactPath,
      strict: true,
      preserveOwner: false,
      chmod: true,
      processUmask: 0,
      filter(path) {
        return path !== MANIFEST_PATH;
      },
    });
    try {
      await lstat(destinationPath);
      throw new Error(`Materialization destination already exists: ${destinationPath}`);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    await rename(temporaryDirectory, destinationPath);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
