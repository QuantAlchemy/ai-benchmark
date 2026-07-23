import { createHash } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ArtifactChunkDescriptor,
  ArtifactManifest,
  PackagedSolutionArtifact,
} from "./artifacts.server";
import {
  MAX_ARTIFACT_EXPANDED_BYTES,
  MAX_ARTIFACT_FILE_BYTES,
  MAX_ARTIFACT_FILES,
} from "./artifacts.server";
import type {
  PullEventsResult,
  RemoteArtifactMetadata,
  RemoteSyncEvent,
  SyncOutboxOperation,
  SyncTransport,
} from "./sync-service.server";

const SHA256 = /^[a-f0-9]{64}$/;
const OPAQUE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_CHUNKS = 64;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`Invalid Convex ${name}`);
  return value as number;
}

function string(value: unknown, name: string, maximum = 1_000_000): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new Error(`Invalid Convex ${name}`);
  }
  return value;
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeManifestPath(path: string): boolean {
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/") ||
    /^[A-Za-z]:\//.test(path)
  ) {
    return false;
  }
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function parseManifestJson(value: unknown): ArtifactManifest {
  const text = string(value, "artifact manifest", 700_000);
  if (new TextEncoder().encode(text).byteLength > 700_000) {
    throw new Error("Invalid Convex artifact manifest");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Invalid Convex artifact manifest");
  }
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, ["version", "files", "totalExpandedBytes"]) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.files) ||
    parsed.files.length > MAX_ARTIFACT_FILES ||
    !Number.isSafeInteger(parsed.totalExpandedBytes) ||
    (parsed.totalExpandedBytes as number) < 0 ||
    (parsed.totalExpandedBytes as number) > MAX_ARTIFACT_EXPANDED_BYTES
  ) {
    throw new Error("Invalid Convex artifact manifest");
  }
  const files = parsed.files.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, ["path", "size", "mode", "sha256"])) {
      throw new Error("Invalid Convex artifact manifest");
    }
    if (
      typeof item.path !== "string" ||
      !isSafeManifestPath(item.path) ||
      !Number.isSafeInteger(item.size) ||
      (item.size as number) < 0 ||
      (item.size as number) > MAX_ARTIFACT_FILE_BYTES ||
      !Number.isSafeInteger(item.mode) ||
      (item.mode as number) < 0 ||
      (item.mode as number) > 0o777 ||
      typeof item.sha256 !== "string" ||
      !SHA256.test(item.sha256)
    ) {
      throw new Error("Invalid Convex artifact manifest");
    }
    return { path: item.path, size: item.size as number, mode: item.mode as number, sha256: item.sha256 };
  });
  for (let index = 1; index < files.length; index += 1) {
    if (files[index]!.path <= files[index - 1]!.path) throw new Error("Invalid Convex artifact manifest");
  }
  const expandedBytes = files.reduce((total, file) => total + file.size, 0);
  if (!Number.isSafeInteger(expandedBytes) || expandedBytes !== parsed.totalExpandedBytes) {
    throw new Error("Invalid Convex artifact manifest");
  }
  return { version: 1, files, totalExpandedBytes: expandedBytes };
}

function parseChunkMetadata(value: unknown): ArtifactChunkDescriptor[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CHUNKS) {
    throw new Error("Invalid Convex artifact chunks");
  }
  let offset = 0;
  return value.map((item, index) => {
    if (!isRecord(item) || item.index !== index) throw new Error("Invalid Convex artifact chunk order");
    const size = integer(item.sizeBytes, "artifact chunk size", 1);
    if (size > MAX_CHUNK_BYTES) throw new Error("Invalid Convex artifact chunk size");
    const sha256 = string(item.sha256, "artifact chunk digest", 64);
    if (!SHA256.test(sha256)) throw new Error("Invalid Convex artifact chunk digest");
    const chunk = { index, offset, size, sha256 };
    offset += size;
    return chunk;
  });
}

export class ConvexHttpSyncTransport implements SyncTransport {
  readonly #baseUrl: string;
  readonly #authorization: string;
  readonly #fetch: FetchImplementation;

  constructor({
    baseUrl,
    clientToken,
    fetch: fetchImplementation = globalThis.fetch,
  }: {
    baseUrl: string;
    clientToken: string;
    fetch?: FetchImplementation;
  }) {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      throw new Error("Convex sync URL must be an HTTPS origin");
    }
    if (!clientToken || /\s/.test(clientToken) || clientToken.length > 4096) {
      throw new Error("Invalid Convex sync client token");
    }
    this.#baseUrl = url.origin;
    this.#authorization = `Bearer ${clientToken}`;
    this.#fetch = fetchImplementation;
  }

  async #request(path: string, init: RequestInit = {}, allowNotFound = false): Promise<Response | null> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.#authorization);
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw new Error(`Convex sync request failed with HTTP ${response.status}`);
    return response;
  }

  async #requestJson(path: string, init: RequestInit = {}, allowNotFound = false): Promise<unknown | null> {
    const response = await this.#request(path, init, allowNotFound);
    if (!response) return null;
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new Error("Convex sync returned invalid JSON");
    }
  }

  async verifyAuthenticatedClient(expectedClientId: string): Promise<void> {
    if (!OPAQUE_UUID.test(expectedClientId)) throw new Error("Invalid expected synchronization client identity");
    const value = await this.#requestJson("/api/sync/status");
    if (!isRecord(value) || typeof value.clientId !== "string" || !OPAQUE_UUID.test(value.clientId)) {
      throw new Error("Convex sync status omitted the authenticated client identity");
    }
    if (value.clientId !== expectedClientId) {
      throw new Error("Authenticated Convex client does not match the local data-root identity");
    }
  }

  async artifactExists(artifactDigest: string): Promise<boolean> {
    if (!SHA256.test(artifactDigest)) throw new Error("Invalid artifact digest");
    const value = await this.#requestJson(`/api/sync/artifacts/${artifactDigest}`, {}, true);
    if (value === null) return false;
    if (!isRecord(value) || value.artifactDigest !== artifactDigest) {
      throw new Error("Invalid Convex artifact metadata");
    }
    return true;
  }

  async uploadArtifact(artifact: PackagedSolutionArtifact): Promise<void> {
    if (!SHA256.test(artifact.artifactSha256) || artifact.chunks.length === 0 || artifact.chunks.length > MAX_CHUNKS) {
      throw new Error("Invalid local artifact metadata");
    }
    const file = await open(artifact.artifactPath, "r");
    const uploaded: Array<{ index: number; storageId: string; sizeBytes: number; sha256: string }> = [];
    try {
      for (const [index, descriptor] of artifact.chunks.entries()) {
        if (descriptor.index !== index || descriptor.size < 1 || descriptor.size > MAX_CHUNK_BYTES) {
          throw new Error("Invalid local artifact chunk metadata");
        }
        const bytes = Buffer.allocUnsafe(descriptor.size);
        const { bytesRead } = await file.read(bytes, 0, descriptor.size, descriptor.offset);
        if (bytesRead !== descriptor.size || createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) {
          throw new Error("Local artifact chunk integrity check failed");
        }
        const uploadValue = await this.#requestJson("/api/sync/artifacts/upload-url", { method: "POST" });
        if (!isRecord(uploadValue)) throw new Error("Invalid Convex upload URL response");
        const uploadUrl = string(uploadValue.uploadUrl, "upload URL", 4096);
        const parsedUploadUrl = new URL(uploadUrl);
        if (parsedUploadUrl.protocol !== "https:") throw new Error("Invalid Convex upload URL");
        const uploadResponse = await this.#fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes,
        });
        if (!uploadResponse.ok) throw new Error(`Convex artifact upload failed with HTTP ${uploadResponse.status}`);
        const uploadResult = (await uploadResponse.json()) as unknown;
        if (!isRecord(uploadResult)) throw new Error("Invalid Convex artifact upload response");
        uploaded.push({
          index,
          storageId: string(uploadResult.storageId, "storage id", 500),
          sizeBytes: descriptor.size,
          sha256: descriptor.sha256,
        });
      }
    } finally {
      await file.close();
    }

    const value = await this.#requestJson("/api/sync/artifacts/finalize", {
      method: "POST",
      body: JSON.stringify({
        digest: artifact.artifactSha256,
        sizeBytes: artifact.artifactSize,
        manifestJson: JSON.stringify(artifact.manifest),
        chunks: uploaded,
      }),
    });
    if (!isRecord(value) || value.digest !== artifact.artifactSha256 || typeof value.created !== "boolean") {
      throw new Error("Invalid Convex artifact finalization response");
    }
  }

  async downloadArtifact(artifactDigest: string, destinationPath: string): Promise<RemoteArtifactMetadata> {
    if (!SHA256.test(artifactDigest)) throw new Error("Invalid artifact digest");
    const value = await this.#requestJson(`/api/sync/artifacts/${artifactDigest}`);
    if (!isRecord(value) || value.artifactDigest !== artifactDigest) {
      throw new Error("Invalid Convex artifact metadata");
    }
    const artifactSize = integer(value.artifactSize, "artifact size", 1);
    const manifest = parseManifestJson(value.manifestJson);
    const chunks = parseChunkMetadata(value.chunks);
    if (chunks.reduce((total, chunk) => total + chunk.size, 0) !== artifactSize) {
      throw new Error("Invalid Convex artifact size");
    }

    await mkdir(dirname(destinationPath), { recursive: true });
    const output = await open(destinationPath, "wx", 0o600);
    const wholeHash = createHash("sha256");
    try {
      for (const chunk of chunks) {
        const response = await this.#request(`/api/sync/artifacts/${artifactDigest}/chunks/${chunk.index}`);
        if (!response) throw new Error("Convex artifact chunk is missing");
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length !== chunk.size || createHash("sha256").update(bytes).digest("hex") !== chunk.sha256) {
          throw new Error("Downloaded artifact chunk integrity check failed");
        }
        const { bytesWritten } = await output.write(bytes, 0, bytes.length, chunk.offset);
        if (bytesWritten !== bytes.length) throw new Error("Incomplete artifact chunk write");
        wholeHash.update(bytes);
      }
      await output.sync();
    } catch (error) {
      await output.close();
      await rm(destinationPath, { force: true });
      throw error;
    }
    await output.close();
    if (wholeHash.digest("hex") !== artifactDigest) {
      await rm(destinationPath, { force: true });
      throw new Error("Downloaded artifact SHA-256 mismatch");
    }
    return { artifactDigest, artifactSize, manifest, chunks };
  }

  async pushOperation(operation: SyncOutboxOperation): Promise<{ sequence: number }> {
    let artifactDigest: string | undefined;
    if (operation.operationType === "upsert") {
      let payload: unknown;
      try {
        payload = JSON.parse(operation.payloadJson) as unknown;
      } catch {
        throw new Error("Invalid local run payload");
      }
      const run = isRecord(payload) && isRecord(payload.run) ? payload.run : null;
      const claimedDigest = run?.artifactDigest;
      if (claimedDigest !== null && claimedDigest !== undefined) {
        if (typeof claimedDigest !== "string" || !SHA256.test(claimedDigest)) {
          throw new Error("Invalid local artifact digest");
        }
        artifactDigest = claimedDigest;
      }
    }
    const value = await this.#requestJson("/api/sync/runs/push", {
      method: "POST",
      body: JSON.stringify({
        operationId: operation.operationId,
        runUid: operation.runUid,
        eventKind: operation.operationType === "upsert" ? "snapshot" : "tombstone",
        payloadJson: operation.payloadJson,
        ...(artifactDigest === undefined ? {} : { artifactDigest }),
      }),
    });
    if (!isRecord(value)) throw new Error("Invalid Convex push response");
    return { sequence: integer(value.sequence, "push sequence", 1) };
  }

  async pullEvents(afterSequence: number, limit: number): Promise<PullEventsResult> {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Invalid sync pull bounds");
    }
    const value = await this.#requestJson(`/api/sync/runs/pull?after=${afterSequence}&limit=${limit}`);
    if (!isRecord(value) || !Array.isArray(value.events) || value.events.length > limit) {
      throw new Error("Invalid Convex pull response");
    }
    const events: RemoteSyncEvent[] = value.events.map((item) => {
      if (!isRecord(item)) throw new Error("Invalid Convex sync event");
      const eventKind = item.eventKind;
      if (eventKind !== "snapshot" && eventKind !== "tombstone") throw new Error("Invalid Convex event kind");
      const createdAt = integer(item.createdAt, "event timestamp");
      return {
        sequence: integer(item.sequence, "event sequence", 1),
        operationId: string(item.operationId, "operation id", 200),
        runUid: string(item.runUid, "run uid", 200),
        operationType: eventKind === "snapshot" ? "upsert" : "delete",
        payloadJson: string(item.payloadJson, "event payload", 900_000),
        actorClientId: string(item.actorClientId, "actor client id", 200),
        createdAt: new Date(createdAt).toISOString(),
      };
    });
    return {
      events,
      latestSequence: integer(value.currentSequence, "current sequence"),
    };
  }
}
