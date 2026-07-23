import { sha256 } from "@noble/hashes/sha2.js";
import { sha256HexToBase64 } from "./crypto";

export const MAX_PULL_LIMIT = 200;
export const DEFAULT_PULL_LIMIT = 100;
export const MAX_ARTIFACT_CHUNKS = 64;
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 700_000;
export const MAX_MANIFEST_FILES = 100_000;
export const MAX_MANIFEST_FILE_BYTES = 512 * 1024 * 1024;
export const MAX_MANIFEST_EXPANDED_BYTES = 1024 * 1024 * 1024;
export const MAX_RUN_PAYLOAD_BYTES = 800_000;

const SHA256 = /^[a-f0-9]{64}$/;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashArtifactBlobs(blobs: readonly Blob[]): Promise<{ digest: string; chunks: string[] }> {
  const wholeHash = sha256.create();
  const chunks: string[] = [];
  for (const blob of blobs) {
    const chunkHash = sha256.create();
    const reader = blob.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        wholeHash.update(value);
        chunkHash.update(value);
      }
    } finally {
      reader.releaseLock();
    }
    chunks.push(hex(chunkHash.digest()));
  }
  return { digest: hex(wholeHash.digest()), chunks };
}

const DECIMAL_INTEGER = /^(0|[1-9][0-9]*)$/;

interface RunPushReplayFields {
  clientDocumentId: string;
  runUid: string;
  eventKind: "snapshot" | "tombstone";
  payloadJson: string;
  artifactDigest?: string;
}

export function isExactRunPushReplay(existing: RunPushReplayFields, incoming: RunPushReplayFields): boolean {
  return (
    existing.clientDocumentId === incoming.clientDocumentId &&
    existing.runUid === incoming.runUid &&
    existing.eventKind === incoming.eventKind &&
    existing.payloadJson === incoming.payloadJson &&
    existing.artifactDigest === incoming.artifactDigest
  );
}

export function assertRunPrincipalAuthorization(
  ownerPrincipalId: string | null,
  actorPrincipalId: string,
  eventKind: "snapshot" | "tombstone",
): void {
  if (ownerPrincipalId === null) {
    if (eventKind === "tombstone") throw new Error("Cannot tombstone a run that has no owner");
    return;
  }
  if (ownerPrincipalId !== actorPrincipalId) {
    throw new Error("Client principal is not authorized to modify this run");
  }
}

const OPAQUE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

export interface ArtifactChunk {
  index: number;
  storageId: string;
  sizeBytes: number;
  sha256: string;
}

export interface ArtifactFinalizeInput {
  digest: string;
  sizeBytes: number;
  manifestJson: string;
  chunks: ArtifactChunk[];
}

export interface StoredChunkMetadata {
  size: number;
  sha256: string;
}

export interface ValidatedArtifactFinalize extends ArtifactFinalizeInput {
  manifest: ArtifactManifest;
}

export interface RunPushInput {
  operationId: string;
  runUid: string;
  eventKind: "snapshot" | "tombstone";
  payloadJson: string;
  artifactDigest?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeArtifactPath(path: string): boolean {
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

function parseManifest(manifestJson: string): ArtifactManifest {
  if (new TextEncoder().encode(manifestJson).byteLength > MAX_MANIFEST_BYTES) {
    throw new Error("Invalid artifact manifest");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(manifestJson);
  } catch {
    throw new Error("Invalid artifact manifest");
  }
  if (!isRecord(decoded) || !hasExactKeys(decoded, ["version", "files", "totalExpandedBytes"])) {
    throw new Error("Invalid artifact manifest");
  }
  if (
    decoded.version !== 1 ||
    !Array.isArray(decoded.files) ||
    decoded.files.length > MAX_MANIFEST_FILES ||
    !Number.isSafeInteger(decoded.totalExpandedBytes) ||
    (decoded.totalExpandedBytes as number) < 0 ||
    (decoded.totalExpandedBytes as number) > MAX_MANIFEST_EXPANDED_BYTES
  ) {
    throw new Error("Invalid artifact manifest");
  }

  const files: ArtifactManifestFile[] = decoded.files.map((value) => {
    if (!isRecord(value) || !hasExactKeys(value, ["path", "size", "mode", "sha256"])) {
      throw new Error("Invalid artifact manifest");
    }
    if (
      typeof value.path !== "string" ||
      !isSafeArtifactPath(value.path) ||
      !Number.isSafeInteger(value.size) ||
      (value.size as number) < 0 ||
      (value.size as number) > MAX_MANIFEST_FILE_BYTES ||
      !Number.isSafeInteger(value.mode) ||
      (value.mode as number) < 0 ||
      (value.mode as number) > 0o777 ||
      Boolean((value.mode as number) & 0o022) ||
      typeof value.sha256 !== "string" ||
      !SHA256.test(value.sha256)
    ) {
      throw new Error("Invalid artifact manifest");
    }
    return {
      path: value.path,
      size: value.size as number,
      mode: value.mode as number,
      sha256: value.sha256,
    };
  });

  for (let index = 1; index < files.length; index += 1) {
    if (files[index]!.path <= files[index - 1]!.path) throw new Error("Invalid artifact manifest");
  }
  const expandedBytes = files.reduce((total, file) => total + file.size, 0);
  if (!Number.isSafeInteger(expandedBytes) || expandedBytes !== decoded.totalExpandedBytes) {
    throw new Error("Invalid artifact manifest");
  }

  return { version: 1, files, totalExpandedBytes: expandedBytes };
}

export function parseBearerToken(header: string | null): string {
  const match = header?.match(/^Bearer ([^\s]+)$/);
  if (!match) throw new Error("Authorization header must contain one Bearer token");
  return match[1]!;
}

export function parsePullBounds(afterValue: string | null, limitValue: string | null): { after: number; limit: number } {
  const afterText = afterValue ?? "0";
  const limitText = limitValue ?? String(DEFAULT_PULL_LIMIT);
  if (!DECIMAL_INTEGER.test(afterText) || !DECIMAL_INTEGER.test(limitText)) {
    throw new Error("Invalid pull bounds");
  }
  const after = Number(afterText);
  const limit = Number(limitText);
  if (!Number.isSafeInteger(after) || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PULL_LIMIT) {
    throw new Error("Invalid pull bounds");
  }
  return { after, limit };
}

const PORTABLE_RUN_KEYS = [
  "runUid",
  "originClientId",
  "benchmarkId",
  "benchmarkName",
  "agentId",
  "agentModel",
  "reasoningEffort",
  "serviceTier",
  "runDurationMs",
  "solutionRelPath",
  "artifactDigest",
  "scoreModel",
  "scorecardContent",
  "scorecardData",
  "metrics",
  "notes",
  "createdAt",
  "updatedAt",
];

function validRequiredRunString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 100_000;
}

function validOptionalRunString(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.length <= 100_000);
}

function validatePortableSnapshot(payload: Record<string, unknown>, operation: RunPushInput): void {
  if (!hasExactKeys(payload, ["version", "run"]) || payload.version !== 1 || !isRecord(payload.run)) {
    throw new Error("Invalid run push payload");
  }
  const run = payload.run;
  if (!hasExactKeys(run, PORTABLE_RUN_KEYS)) throw new Error("Invalid run push payload");
  if (
    typeof run.runUid !== "string" ||
    run.runUid !== operation.runUid ||
    !OPAQUE_UUID.test(run.runUid) ||
    typeof run.originClientId !== "string" ||
    !OPAQUE_UUID.test(run.originClientId) ||
    !validRequiredRunString(run.benchmarkId) ||
    !validRequiredRunString(run.benchmarkName) ||
    !validOptionalRunString(run.agentId) ||
    !validOptionalRunString(run.agentModel) ||
    !validOptionalRunString(run.reasoningEffort) ||
    !validOptionalRunString(run.serviceTier) ||
    (run.runDurationMs !== null &&
      (!Number.isSafeInteger(run.runDurationMs) || (run.runDurationMs as number) < 0)) ||
    !validOptionalRunString(run.solutionRelPath) ||
    (run.artifactDigest !== null && (typeof run.artifactDigest !== "string" || !SHA256.test(run.artifactDigest))) ||
    !validRequiredRunString(run.scoreModel) ||
    !validRequiredRunString(run.scorecardContent) ||
    !isRecord(run.scorecardData) ||
    !isRecord(run.metrics) ||
    typeof run.notes !== "string" ||
    run.notes.length > 100_000 ||
    !validRequiredRunString(run.createdAt) ||
    !validRequiredRunString(run.updatedAt)
  ) {
    throw new Error("Invalid run push payload");
  }
  const topLevelDigest = operation.artifactDigest ?? null;
  if (run.artifactDigest !== topLevelDigest) throw new Error("Invalid run push payload");
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validateTombstonePayload(payload: Record<string, unknown>, runUid: string): void {
  if (
    !hasExactKeys(payload, ["version", "runUid", "deletedAt"]) ||
    payload.version !== 1 ||
    payload.runUid !== runUid ||
    !isCanonicalUtcTimestamp(payload.deletedAt)
  ) {
    throw new Error("Invalid run push payload");
  }
}

export function validateRunPush(value: unknown): RunPushInput {
  if (!isRecord(value)) throw new Error("Invalid run push payload");
  const keys = Object.keys(value);
  if (
    keys.some((key) => !["operationId", "runUid", "eventKind", "payloadJson", "artifactDigest"].includes(key)) ||
    !["operationId", "runUid", "eventKind", "payloadJson"].every((key) => keys.includes(key)) ||
    typeof value.operationId !== "string" ||
    !OPAQUE_UUID.test(value.operationId) ||
    typeof value.runUid !== "string" ||
    !OPAQUE_UUID.test(value.runUid) ||
    (value.eventKind !== "snapshot" && value.eventKind !== "tombstone") ||
    typeof value.payloadJson !== "string" ||
    new TextEncoder().encode(value.payloadJson).byteLength > MAX_RUN_PAYLOAD_BYTES ||
    (value.artifactDigest !== undefined &&
      (typeof value.artifactDigest !== "string" || !SHA256.test(value.artifactDigest)))
  ) {
    throw new Error("Invalid run push payload");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(value.payloadJson);
  } catch {
    throw new Error("Invalid run push payload");
  }
  if (!isRecord(payload)) throw new Error("Invalid run push payload");
  if (value.eventKind === "tombstone" && value.artifactDigest !== undefined) {
    throw new Error("Tombstones cannot reference artifacts");
  }
  const operation: RunPushInput = {
    operationId: value.operationId,
    runUid: value.runUid,
    eventKind: value.eventKind,
    payloadJson: value.payloadJson,
    artifactDigest: value.artifactDigest as string | undefined,
  };
  if (operation.eventKind === "snapshot") validatePortableSnapshot(payload, operation);
  else validateTombstonePayload(payload, operation.runUid);
  return operation;
}

export function validateArtifactFinalize(
  value: unknown,
  metadataByStorageId: ReadonlyMap<string, StoredChunkMetadata>,
): ValidatedArtifactFinalize {
  if (!isRecord(value) || !hasExactKeys(value, ["digest", "sizeBytes", "manifestJson", "chunks"])) {
    throw new Error("Invalid artifact finalization payload");
  }
  if (typeof value.digest !== "string" || !SHA256.test(value.digest)) {
    throw new Error("Invalid artifact digest");
  }
  if (
    !Number.isSafeInteger(value.sizeBytes) ||
    (value.sizeBytes as number) < 1 ||
    (value.sizeBytes as number) > MAX_ARTIFACT_BYTES
  ) {
    throw new Error("Invalid artifact size");
  }
  if (typeof value.manifestJson !== "string" || !Array.isArray(value.chunks)) {
    throw new Error("Invalid artifact finalization payload");
  }
  if (value.chunks.length < 1 || value.chunks.length > MAX_ARTIFACT_CHUNKS) {
    throw new Error("Artifact chunk count exceeds limit");
  }

  const chunks: ArtifactChunk[] = value.chunks.map((chunk, index) => {
    if (!isRecord(chunk) || !hasExactKeys(chunk, ["index", "storageId", "sizeBytes", "sha256"])) {
      throw new Error("Invalid artifact chunk");
    }
    if (!Number.isSafeInteger(chunk.index) || chunk.index !== index) {
      throw new Error("Artifact chunks must be ordered 0..N-1");
    }
    if (
      typeof chunk.storageId !== "string" ||
      chunk.storageId.length === 0 ||
      !Number.isSafeInteger(chunk.sizeBytes) ||
      (chunk.sizeBytes as number) < 1 ||
      (chunk.sizeBytes as number) > MAX_CHUNK_BYTES ||
      typeof chunk.sha256 !== "string" ||
      !SHA256.test(chunk.sha256)
    ) {
      throw new Error("Invalid artifact chunk size");
    }
    return {
      index,
      storageId: chunk.storageId,
      sizeBytes: chunk.sizeBytes as number,
      sha256: chunk.sha256,
    };
  });

  const uniqueStorageIds = new Set(chunks.map((chunk) => chunk.storageId));
  if (uniqueStorageIds.size !== chunks.length) throw new Error("Artifact storage chunks must be unique");
  const totalBytes = chunks.reduce((total, chunk) => total + chunk.sizeBytes, 0);
  if (totalBytes !== value.sizeBytes) throw new Error("Artifact chunk sizes do not match artifact size");

  const manifest = parseManifest(value.manifestJson);
  for (const chunk of chunks) {
    const metadata = metadataByStorageId.get(chunk.storageId);
    if (!metadata) throw new Error(`Stored chunk ${chunk.index} does not exist`);
    // Convex `_storage.sha256` is base64; the portable sync protocol uses lowercase hex.
    const hashMatches = metadata.sha256 === chunk.sha256 || metadata.sha256 === sha256HexToBase64(chunk.sha256);
    if (metadata.size !== chunk.sizeBytes || !hashMatches) {
      throw new Error(`Stored chunk metadata does not match chunk ${chunk.index}`);
    }
  }

  return {
    digest: value.digest,
    sizeBytes: value.sizeBytes as number,
    manifestJson: value.manifestJson,
    chunks,
    manifest,
  };
}
