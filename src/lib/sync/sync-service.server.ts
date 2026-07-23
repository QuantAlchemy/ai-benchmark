import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { cp, link, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import {
  describeArtifactChunks,
  materializeSolutionArtifact,
  packageSolutionArtifact,
  type ArtifactChunkDescriptor,
  type ArtifactManifest,
  type PackagedSolutionArtifact,
} from "./artifacts.server";
import { openLocalStore, type LocalStore } from "./local-store.server";

const RUN_UID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PULL_LIMIT = 100;
export const MAX_OUTBOX_ATTEMPTS = 8;
const SYNC_PREFLIGHT_RETRY_MS = 30_000;

export async function installMaterializedDirectoryNoClobber(stagingPath: string, destinationPath: string) {
  // Intentional: claiming the final path with mkdir prevents POSIX rename from clobbering a concurrent empty directory.
  // Copying can expose a partial untrusted tree briefly; trust is recorded only after the complete copy succeeds.
  await mkdir(destinationPath, { mode: 0o700 });
  try {
    for (const entry of await readdir(stagingPath)) {
      await cp(join(stagingPath, entry), join(destinationPath, entry), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }
    await rm(stagingPath, { recursive: true, force: true });
  } catch (error) {
    if (existsSync(destinationPath)) {
      await rename(
        destinationPath,
        join(dirname(destinationPath), `.${basename(destinationPath)}.failed-${randomUUID()}`),
      );
    }
    throw error;
  }
}

export interface SyncOutboxOperation {
  operationId: string;
  runUid: string;
  operationType: "upsert" | "delete";
  payloadJson: string;
}

export interface RemoteSyncEvent extends SyncOutboxOperation {
  sequence: number;
  actorClientId: string;
  createdAt: string;
}

export interface PullEventsResult {
  events: RemoteSyncEvent[];
  latestSequence: number;
}

export interface RemoteArtifactMetadata {
  artifactDigest: string;
  artifactSize: number;
  manifest: ArtifactManifest;
  chunks: ArtifactChunkDescriptor[];
}

export interface SyncTransport {
  verifyAuthenticatedClient(expectedClientId: string): Promise<void>;
  artifactExists(artifactDigest: string): Promise<boolean>;
  uploadArtifact(artifact: PackagedSolutionArtifact): Promise<void>;
  downloadArtifact(artifactDigest: string, destinationPath: string): Promise<RemoteArtifactMetadata>;
  pushOperation(operation: SyncOutboxOperation): Promise<{ sequence: number }>;
  pullEvents(afterSequence: number, limit: number): Promise<PullEventsResult>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  uploaded: number;
  downloaded: number;
  materialized: number;
  errors: string[];
}

type OutboxRow = {
  operation_id: string;
  run_uid: string;
  operation_type: "upsert" | "delete";
  payload_json: string;
  attempt_count: number;
};

type LocalArtifactRow = {
  artifact_digest: string;
  archive_path: string;
  manifest_json: string;
  size_bytes: number;
  file_count: number;
  status: string;
};

type RunRow = {
  id: number;
  run_uid: string;
  origin_client_id: string;
  benchmark_id: string;
  benchmark_name: string;
  agent_id: string | null;
  agent_model: string | null;
  reasoning_effort: string | null;
  service_tier: string | null;
  run_duration_ms: number | null;
  solution_path: string;
  solution_rel_path: string | null;
  artifact_digest: string | null;
  sync_status: string;
  score_model: string;
  scorecard_content: string;
  scorecard_data: string;
  metrics: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type PortableRunSnapshot = {
  runUid: string;
  originClientId: string;
  benchmarkId: string;
  benchmarkName: string;
  agentId: string | null;
  agentModel: string | null;
  reasoningEffort: string | null;
  serviceTier: string | null;
  runDurationMs: number | null;
  solutionRelPath: string | null;
  artifactDigest: string | null;
  scoreModel: string;
  scorecardContent: string;
  scorecardData: Record<string, unknown>;
  metrics: Record<string, unknown>;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function recordOutboxFailure(store: LocalStore, operation: OutboxRow, message: string): void {
  const attempt = operation.attempt_count + 1;
  const failedAt = new Date();
  const deadLetteredAt = attempt >= MAX_OUTBOX_ATTEMPTS ? failedAt.toISOString() : null;
  const delayMs = Math.min(300_000, 1_000 * 2 ** Math.min(attempt, 8));
  const nextAttemptAt = deadLetteredAt ? null : new Date(failedAt.getTime() + delayMs).toISOString();
  store
    .prepare(
      `UPDATE sync_outbox SET status = 'failed', attempt_count = ?, next_attempt_at = ?,
         dead_lettered_at = ?, last_error = ?, updated_at = ? WHERE operation_id = ?`,
    )
    .run(attempt, nextAttemptAt, deadLetteredAt, message, failedAt.toISOString(), operation.operation_id);
}

function recordOutboxPreflightFailure(store: LocalStore, operation: OutboxRow, message: string): void {
  const failedAt = new Date();
  store
    .prepare(
      `UPDATE sync_outbox SET status = 'failed', next_attempt_at = ?, last_error = ?, updated_at = ?
       WHERE operation_id = ?`,
    )
    .run(
      new Date(failedAt.getTime() + SYNC_PREFLIGHT_RETRY_MS).toISOString(),
      message,
      failedAt.toISOString(),
      operation.operation_id,
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Invalid remote run ${name}`);
  return value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100_000) {
    throw new Error(`Invalid remote run ${name}`);
  }
  return value;
}

function boundedString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length > 100_000) {
    throw new Error(`Invalid remote run ${name}`);
  }
  return value;
}

function parsePortableRun(payloadJson: string, expectedRunUid: string): PortableRunSnapshot {
  if (payloadJson.length > 900_000) throw new Error("Remote run payload is too large");
  const payload = JSON.parse(payloadJson) as unknown;
  if (!isRecord(payload) || payload.version !== 1 || !isRecord(payload.run)) {
    throw new Error("Invalid remote run payload");
  }
  const run = payload.run;
  const runUid = requiredString(run.runUid, "runUid");
  if (!RUN_UID_PATTERN.test(runUid) || runUid !== expectedRunUid) throw new Error("Invalid remote run uid");
  const runDurationMs = run.runDurationMs;
  if (runDurationMs !== null && (!Number.isSafeInteger(runDurationMs) || (runDurationMs as number) < 0)) {
    throw new Error("Invalid remote run duration");
  }
  if (!isRecord(run.scorecardData) || !isRecord(run.metrics)) throw new Error("Invalid remote run structured data");
  const artifactDigest = nullableString(run.artifactDigest, "artifactDigest");
  if (artifactDigest && !SHA256_PATTERN.test(artifactDigest)) throw new Error("Invalid remote artifact digest");
  return {
    runUid,
    originClientId: requiredString(run.originClientId, "originClientId"),
    benchmarkId: requiredString(run.benchmarkId, "benchmarkId"),
    benchmarkName: requiredString(run.benchmarkName, "benchmarkName"),
    agentId: nullableString(run.agentId, "agentId"),
    agentModel: nullableString(run.agentModel, "agentModel"),
    reasoningEffort: nullableString(run.reasoningEffort, "reasoningEffort"),
    serviceTier: nullableString(run.serviceTier, "serviceTier"),
    runDurationMs: runDurationMs as number | null,
    solutionRelPath: nullableString(run.solutionRelPath, "solutionRelPath"),
    artifactDigest,
    scoreModel: requiredString(run.scoreModel, "scoreModel"),
    scorecardContent: requiredString(run.scorecardContent, "scorecardContent"),
    scorecardData: run.scorecardData,
    metrics: run.metrics,
    notes: boundedString(run.notes, "notes"),
    createdAt: requiredString(run.createdAt, "createdAt"),
    updatedAt: requiredString(run.updatedAt, "updatedAt"),
  };
}

function safeSolutionRelativePath(benchmarkId: string, runUid: string, requested: string | null): string {
  if (requested) {
    const normalized = requested.replaceAll("\\", "/");
    if (
      !isAbsolute(normalized) &&
      !posix.isAbsolute(normalized) &&
      posix.normalize(normalized) === normalized &&
      normalized.startsWith("solutions/") &&
      !normalized.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      return normalized;
    }
  }
  const safeBenchmarkId = benchmarkId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100) || "benchmark";
  return `solutions/${safeBenchmarkId}/${runUid}`;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function isVerifiedArtifactFile(path: string, digest: string, sizeBytes: number): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size === sizeBytes && (await sha256File(path)) === digest;
  } catch {
    return false;
  }
}

function artifactPath(dataRoot: string, digest: string) {
  return join(dataRoot, "artifacts", `${digest}.tar.gz`);
}

function hasTrustedMaterialization(store: LocalStore, run: RunRow): boolean {
  if (!existsSync(run.solution_path)) return false;
  if (run.origin_client_id === store.clientId) return true;
  if (!run.artifact_digest) return false;
  const materialization = store
    .prepare(
      `SELECT 1
       FROM local_artifacts AS artifact
       JOIN artifact_materializations AS materialization
         ON materialization.artifact_digest = artifact.artifact_digest
       WHERE artifact.artifact_digest = ? AND artifact.status = 'ready'
         AND materialization.materialized_path = ?`,
    )
    .get(run.artifact_digest, resolve(run.solution_path));
  return materialization !== undefined;
}

export class SyncService {
  readonly #dataRoot: string;
  readonly #legacyDataRoot: string | undefined;
  readonly #projectRoot: string;
  readonly #clientId: string | undefined;
  readonly #transport: SyncTransport;

  constructor({
    dataRoot,
    legacyDataRoot,
    projectRoot,
    clientId,
    transport,
  }: {
    dataRoot: string;
    legacyDataRoot?: string;
    projectRoot: string;
    clientId?: string;
    transport: SyncTransport;
  }) {
    this.#dataRoot = resolve(dataRoot);
    this.#legacyDataRoot = legacyDataRoot ? resolve(legacyDataRoot) : undefined;
    this.#projectRoot = resolve(projectRoot);
    this.#clientId = clientId;
    this.#transport = transport;
  }

  async syncOnce({ force = false }: { force?: boolean } = {}): Promise<SyncResult> {
    const result: SyncResult = { pushed: 0, pulled: 0, uploaded: 0, downloaded: 0, materialized: 0, errors: [] };
    const store = openLocalStore({ dataRoot: this.#dataRoot, legacyDataRoot: this.#legacyDataRoot, clientId: this.#clientId });
    try {
      store
        .prepare(
          `UPDATE sync_outbox SET status = 'failed', next_attempt_at = NULL,
             last_error = COALESCE(last_error, 'Interrupted before acknowledgement')
           WHERE status = 'processing'`,
        )
        .run();
      const now = new Date().toISOString();
      const outbox = store
        .prepare(
          force
            ? "SELECT * FROM sync_outbox WHERE dead_lettered_at IS NULL ORDER BY created_at, rowid"
            : `SELECT * FROM sync_outbox
               WHERE dead_lettered_at IS NULL
                 AND status IN ('pending', 'failed') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
               ORDER BY created_at, rowid`,
        )
        .all(...(force ? [] : [now])) as OutboxRow[];
      try {
        await this.#transport.verifyAuthenticatedClient(store.clientId);
      } catch (error) {
        const message = errorMessage(error);
        for (const operation of outbox) recordOutboxPreflightFailure(store, operation, message);
        const failedAt = new Date().toISOString();
        store
          .prepare("UPDATE sync_state SET last_error = ?, updated_at = ? WHERE scope = 'remote'")
          .run(`authentication: ${message}`, failedAt);
        result.errors.push(`authentication: ${message}`);
        return result;
      }
      for (const initialOperation of outbox) {
        try {
          store
            .prepare("UPDATE sync_outbox SET status = 'processing', updated_at = ? WHERE operation_id = ?")
            .run(new Date().toISOString(), initialOperation.operation_id);
          let operation = initialOperation;
          if (operation.operation_type === "upsert") {
            const packaged = await this.#ensurePackaged(store, operation.run_uid);
            operation = store.prepare("SELECT * FROM sync_outbox WHERE operation_id = ?").get(operation.operation_id) as OutboxRow;
            if (packaged && !(await this.#transport.artifactExists(packaged.artifactSha256))) {
              await this.#transport.uploadArtifact(packaged);
              result.uploaded += 1;
            }
          }
          await this.#transport.pushOperation({
            operationId: operation.operation_id,
            runUid: operation.run_uid,
            operationType: operation.operation_type,
            payloadJson: operation.payload_json,
          });
          store.transaction(() => {
            store.prepare("DELETE FROM sync_outbox WHERE operation_id = ?").run(operation.operation_id);
            const remaining = store.prepare("SELECT 1 FROM sync_outbox WHERE run_uid = ? LIMIT 1").get(operation.run_uid);
            if (!remaining) store.prepare("UPDATE benchmark_runs SET sync_status = 'synced' WHERE run_uid = ?").run(operation.run_uid);
          });
          result.pushed += 1;
        } catch (error) {
          const message = errorMessage(error);
          recordOutboxFailure(store, initialOperation, message);
          result.errors.push(`push ${initialOperation.operation_id}: ${message}`);
        }
      }

      try {
        result.pulled += await this.#pull(store);
      } catch (error) {
        const message = errorMessage(error);
        store
          .prepare("UPDATE sync_state SET last_error = ?, updated_at = ? WHERE scope = 'remote'")
          .run(message, new Date().toISOString());
        result.errors.push(`pull: ${message}`);
      }

      const remoteRuns = store
        .prepare(
          `SELECT current.*
           FROM benchmark_runs AS current
           WHERE current.artifact_digest IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM benchmark_runs AS newer
               WHERE newer.artifact_digest IS NOT NULL
                 AND newer.solution_path = current.solution_path
                 AND newer.id > current.id
             )
           ORDER BY current.id`,
        )
        .all() as RunRow[];
      for (const run of remoteRuns) {
        if (hasTrustedMaterialization(store, run)) continue;
        try {
          const download = await this.#ensureArtifactDownloaded(store, run.artifact_digest!);
          result.downloaded += download.downloaded ? 1 : 0;
          await this.#materialize(store, run, download.row);
          result.materialized += 1;
        } catch (error) {
          result.errors.push(`artifact ${run.artifact_digest}: ${errorMessage(error)}`);
        }
      }
      if (result.errors.length > 0) {
        const failedAt = new Date().toISOString();
        store
          .prepare("UPDATE sync_state SET last_error = ?, updated_at = ? WHERE scope = 'remote'")
          .run(result.errors.at(-1)!, failedAt);
      }
      return result;
    } finally {
      store.close();
    }
  }

  async ensureMaterialized(runId: number): Promise<string> {
    const store = openLocalStore({ dataRoot: this.#dataRoot, legacyDataRoot: this.#legacyDataRoot, clientId: this.#clientId });
    try {
      const run = store.prepare("SELECT * FROM benchmark_runs WHERE id = ?").get(runId) as RunRow | undefined;
      if (!run) throw new Error(`No benchmark run with id "${runId}".`);
      if (hasTrustedMaterialization(store, run)) return run.solution_path;
      if (!run.artifact_digest) throw new Error("This run has no synchronized solution artifact");
      const artifact = await this.#ensureArtifactDownloaded(store, run.artifact_digest);
      await this.#materialize(store, run, artifact.row);
      return run.solution_path;
    } finally {
      store.close();
    }
  }

  async #ensurePackaged(store: LocalStore, runUid: string): Promise<PackagedSolutionArtifact | null> {
    const run = store.prepare("SELECT * FROM benchmark_runs WHERE run_uid = ?").get(runUid) as RunRow | undefined;
    if (!run || !existsSync(run.solution_path)) return null;
    if (run.artifact_digest) {
      const local = store.prepare("SELECT * FROM local_artifacts WHERE artifact_digest = ?").get(run.artifact_digest) as
        | LocalArtifactRow
        | undefined;
      if (local && (await isVerifiedArtifactFile(local.archive_path, local.artifact_digest, local.size_bytes))) {
        const manifest = JSON.parse(local.manifest_json) as ArtifactManifest;
        return {
          artifactPath: local.archive_path,
          artifactSha256: local.artifact_digest,
          artifactSize: local.size_bytes,
          manifest,
          chunks: await describeArtifactChunks(local.archive_path),
        };
      }
    }

    const stagingPath = join(this.#dataRoot, "artifacts", `.package-${runUid}-${randomUUID()}.tar.gz`);
    const packaged = await packageSolutionArtifact({ solutionDir: run.solution_path, artifactPath: stagingPath });
    const finalPath = artifactPath(this.#dataRoot, packaged.artifactSha256);
    await mkdir(dirname(finalPath), { recursive: true });
    try {
      await link(stagingPath, finalPath);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      const existing = await stat(finalPath);
      if (
        !existing.isFile() ||
        existing.size !== packaged.artifactSize ||
        (await sha256File(finalPath)) !== packaged.artifactSha256
      ) {
        throw new Error(`Immutable artifact cache collision for ${packaged.artifactSha256}`);
      }
    } finally {
      await rm(stagingPath, { force: true });
    }
    const finalized = { ...packaged, artifactPath: finalPath };
    const now = new Date().toISOString();
    store.transaction(() => {
      store
        .prepare(
          `INSERT INTO local_artifacts (
            artifact_digest, archive_path, manifest_json, size_bytes, file_count, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)
          ON CONFLICT(artifact_digest) DO UPDATE SET
            archive_path = excluded.archive_path, manifest_json = excluded.manifest_json,
            size_bytes = excluded.size_bytes, file_count = excluded.file_count,
            status = 'ready', updated_at = excluded.updated_at`,
        )
        .run(
          finalized.artifactSha256,
          finalPath,
          JSON.stringify(finalized.manifest),
          finalized.artifactSize,
          finalized.manifest.files.length,
          now,
          now,
        );
      const materializedPath = resolve(run.solution_path);
      store
        .prepare("DELETE FROM artifact_materializations WHERE materialized_path = ? AND artifact_digest <> ?")
        .run(materializedPath, finalized.artifactSha256);
      store
        .prepare(
          `INSERT INTO artifact_materializations (
             artifact_digest, materialized_path, verified_at, updated_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(artifact_digest, materialized_path) DO UPDATE SET
             verified_at = excluded.verified_at, updated_at = excluded.updated_at`,
        )
        .run(finalized.artifactSha256, materializedPath, now, now);
      store
        .prepare("UPDATE benchmark_runs SET artifact_digest = ?, sync_status = 'pending' WHERE run_uid = ?")
        .run(finalized.artifactSha256, runUid);
      const operations = store
        .prepare("SELECT operation_id, payload_json FROM sync_outbox WHERE run_uid = ? AND operation_type = 'upsert'")
        .all(runUid) as Array<{ operation_id: string; payload_json: string }>;
      for (const operation of operations) {
        const payload = JSON.parse(operation.payload_json) as { run?: { artifactDigest?: string | null } };
        if (!payload.run) throw new Error("Invalid local outbox payload");
        payload.run.artifactDigest = finalized.artifactSha256;
        store.prepare("UPDATE sync_outbox SET payload_json = ?, updated_at = ? WHERE operation_id = ?").run(
          JSON.stringify(payload),
          now,
          operation.operation_id,
        );
      }
    });
    return finalized;
  }

  async #pull(store: LocalStore): Promise<number> {
    const state = store.prepare("SELECT cursor FROM sync_state WHERE scope = 'remote'").get() as { cursor: string | null };
    let cursor = state.cursor ? Number.parseInt(state.cursor, 10) : 0;
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Invalid local sync cursor");
    let pulled = 0;
    while (true) {
      const page = await this.#transport.pullEvents(cursor, PULL_LIMIT);
      if (!Array.isArray(page.events) || page.events.length > PULL_LIMIT) throw new Error("Invalid remote sync page");
      if (page.events.length === 0) break;
      for (const event of page.events) {
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor) throw new Error("Remote sequence is not monotonic");
        store.transaction(() => {
          this.#applyRemoteEvent(store, event);
          store
            .prepare(
              `UPDATE sync_state SET cursor = ?, last_sync_at = ?, last_error = NULL, updated_at = ?
               WHERE scope = 'remote'`,
            )
            .run(String(event.sequence), new Date().toISOString(), new Date().toISOString());
        });
        cursor = event.sequence;
        pulled += 1;
      }
      if (page.events.length < PULL_LIMIT) break;
    }
    const completedAt = new Date().toISOString();
    store
      .prepare(
        `UPDATE sync_state SET cursor = ?, last_sync_at = ?, last_error = NULL, updated_at = ?
         WHERE scope = 'remote'`,
      )
      .run(String(cursor), completedAt, completedAt);
    return pulled;
  }

  #applyRemoteEvent(store: LocalStore, event: RemoteSyncEvent) {
    if (!RUN_UID_PATTERN.test(event.runUid) || event.operationId.length === 0 || event.operationId.length > 200) {
      throw new Error("Invalid remote sync event");
    }
    const pending = store
      .prepare("SELECT 1 FROM sync_outbox WHERE run_uid = ? AND status IN ('pending', 'processing') LIMIT 1")
      .get(event.runUid);
    if (pending) return;
    if (event.operationType === "delete") {
      store.prepare("DELETE FROM benchmark_runs WHERE run_uid = ?").run(event.runUid);
      return;
    }
    if (event.operationType !== "upsert") throw new Error("Invalid remote operation type");
    const run = parsePortableRun(event.payloadJson, event.runUid);
    const requestedRelativePath = safeSolutionRelativePath(run.benchmarkId, run.runUid, run.solutionRelPath);
    const localPath = resolve(this.#projectRoot, requestedRelativePath);
    const rootRelative = relative(this.#projectRoot, localPath).replaceAll("\\", "/");
    if (!rootRelative.startsWith("solutions/")) throw new Error("Unsafe remote solution path");
    const existing = store.prepare("SELECT * FROM benchmark_runs WHERE run_uid = ?").get(run.runUid) as RunRow | undefined;
    const solutionPath = existing && existsSync(existing.solution_path) ? existing.solution_path : localPath;
    const values = [
      event.actorClientId,
      run.benchmarkId,
      run.benchmarkName,
      run.agentId,
      run.agentModel,
      run.reasoningEffort,
      run.serviceTier,
      run.runDurationMs,
      solutionPath,
      requestedRelativePath,
      run.artifactDigest,
      run.scoreModel,
      run.scorecardContent,
      run.scorecardContent,
      JSON.stringify(run.scorecardData),
      JSON.stringify(run.metrics),
      run.notes,
      run.createdAt,
      run.updatedAt,
    ];
    if (existing) {
      store
        .prepare(
          `UPDATE benchmark_runs SET
            origin_client_id = ?, benchmark_id = ?, benchmark_name = ?, agent_id = ?, agent_model = ?,
            reasoning_effort = ?, service_tier = ?, run_duration_ms = ?, solution_path = ?, solution_rel_path = ?,
            artifact_digest = ?, sync_status = 'remote', score_model = ?, rubric_snapshot = ?, scorecard_content = ?,
            scorecard_data = ?, metrics = ?, notes = ?, created_at = ?, updated_at = ?
           WHERE run_uid = ?`,
        )
        .run(...values, run.runUid);
    } else {
      store
        .prepare(
          `INSERT INTO benchmark_runs (
            run_uid, origin_client_id, benchmark_id, benchmark_name, agent_id, agent_model,
            reasoning_effort, service_tier, run_duration_ms, solution_path, solution_rel_path,
            artifact_digest, sync_status, score_model, scorecard_path, rubric_snapshot,
            scorecard_content, scorecard_data, metrics, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'remote', ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(run.runUid, ...values);
    }
  }

  async #ensureArtifactDownloaded(
    store: LocalStore,
    digest: string,
  ): Promise<{ row: LocalArtifactRow; downloaded: boolean }> {
    const existing = store.prepare("SELECT * FROM local_artifacts WHERE artifact_digest = ?").get(digest) as
      | LocalArtifactRow
      | undefined;
    if (existing && (await isVerifiedArtifactFile(existing.archive_path, digest, existing.size_bytes))) {
      return { row: existing, downloaded: false };
    }
    await this.#transport.verifyAuthenticatedClient(store.clientId);
    const finalPath = artifactPath(this.#dataRoot, digest);
    const temporaryPath = join(this.#dataRoot, "artifacts", `.download-${digest}-${randomUUID()}.tmp`);
    await mkdir(dirname(temporaryPath), { recursive: true });
    try {
      const metadata = await this.#transport.downloadArtifact(digest, temporaryPath);
      if (metadata.artifactDigest !== digest || !SHA256_PATTERN.test(digest)) throw new Error("Remote artifact digest mismatch");
      const info = await stat(temporaryPath);
      if (info.size !== metadata.artifactSize || (await sha256File(temporaryPath)) !== digest) {
        throw new Error("Downloaded artifact integrity check failed");
      }
      if (existsSync(finalPath) && !(await isVerifiedArtifactFile(finalPath, digest, metadata.artifactSize))) {
        await rename(finalPath, `${finalPath}.corrupt-${randomUUID()}`);
      }
      if (existsSync(finalPath)) {
        if (!(await isVerifiedArtifactFile(finalPath, digest, metadata.artifactSize))) {
          throw new Error(`Immutable artifact cache collision for ${digest}`);
        }
      } else {
        try {
          await link(temporaryPath, finalPath);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
          if (!(await isVerifiedArtifactFile(finalPath, digest, metadata.artifactSize))) {
            throw new Error(`Immutable artifact cache collision for ${digest}`);
          }
        }
      }
      await rm(temporaryPath, { force: true });
      const now = new Date().toISOString();
      store
        .prepare(
          `INSERT INTO local_artifacts (
            artifact_digest, archive_path, manifest_json, size_bytes, file_count, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'downloaded', ?, ?)
          ON CONFLICT(artifact_digest) DO UPDATE SET
            archive_path = excluded.archive_path, manifest_json = excluded.manifest_json,
            size_bytes = excluded.size_bytes, file_count = excluded.file_count,
            status = 'downloaded', materialized_path = NULL, updated_at = excluded.updated_at`,
        )
        .run(digest, finalPath, JSON.stringify(metadata.manifest), metadata.artifactSize, metadata.manifest.files.length, now, now);
      const row = store.prepare("SELECT * FROM local_artifacts WHERE artifact_digest = ?").get(digest) as LocalArtifactRow;
      return { row, downloaded: true };
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async #materialize(store: LocalStore, run: RunRow, artifact: LocalArtifactRow) {
    const materializedPath = resolve(run.solution_path);
    const staleMaterialization = existsSync(materializedPath)
      ? (store
          .prepare(
            `SELECT materialization.artifact_digest
             FROM artifact_materializations AS materialization
             WHERE materialization.materialized_path = ? AND materialization.artifact_digest <> ?
               AND NOT EXISTS (
                 SELECT 1 FROM benchmark_runs AS newer
                 WHERE newer.solution_path = ? AND newer.id > ?
               )`,
          )
          .get(materializedPath, artifact.artifact_digest, run.solution_path, run.id) as
          | { artifact_digest: string }
          | undefined)
      : undefined;
    const replacedPath = staleMaterialization
      ? join(
          dirname(materializedPath),
          `.${basename(materializedPath)}.replaced-${staleMaterialization.artifact_digest.slice(0, 12)}-${randomUUID()}`,
        )
      : null;
    const stagingPath = replacedPath
      ? join(dirname(materializedPath), `.${basename(materializedPath)}.materializing-${randomUUID()}`)
      : materializedPath;
    let installedReplacement = false;
    // Intentional: stage replacements separately and preserve the prior verified tree as a sibling backup.
    // It may contain local edits, and rollback must never delete a destination installed by another writer.
    if (replacedPath) await rename(materializedPath, replacedPath);

    try {
      await materializeSolutionArtifact({
        artifactPath: artifact.archive_path,
        expectedArtifactSha256: artifact.artifact_digest,
        destinationDir: stagingPath,
      });
      if (replacedPath) {
        if (existsSync(materializedPath)) {
          throw new Error(`Materialization destination changed while replacing ${materializedPath}`);
        }
        await installMaterializedDirectoryNoClobber(stagingPath, materializedPath);
        installedReplacement = true;
      }
      const now = new Date().toISOString();
      store.transaction(() => {
        store.prepare("UPDATE benchmark_runs SET sync_status = 'synced' WHERE id = ?").run(run.id);
        store
          .prepare(
            `UPDATE local_artifacts
             SET status = 'ready', updated_at = ?
             WHERE artifact_digest = ?`,
          )
          .run(now, artifact.artifact_digest);
        store
          .prepare("DELETE FROM artifact_materializations WHERE materialized_path = ? AND artifact_digest <> ?")
          .run(materializedPath, artifact.artifact_digest);
        store
          .prepare(
            `INSERT INTO artifact_materializations (
               artifact_digest, materialized_path, verified_at, updated_at
             ) VALUES (?, ?, ?, ?)
             ON CONFLICT(artifact_digest, materialized_path) DO UPDATE SET
               verified_at = excluded.verified_at, updated_at = excluded.updated_at`,
          )
          .run(artifact.artifact_digest, materializedPath, now, now);
      });
    } catch (error) {
      if (replacedPath && staleMaterialization) {
        if (existsSync(stagingPath)) await rm(stagingPath, { recursive: true, force: true });
        if (installedReplacement && existsSync(materializedPath)) {
          await rename(
            materializedPath,
            join(dirname(materializedPath), `.${basename(materializedPath)}.failed-${randomUUID()}`),
          );
        }
        const invalidateStaleTrust = () =>
          store
            .prepare(
              "DELETE FROM artifact_materializations WHERE materialized_path = ? AND artifact_digest = ?",
            )
            .run(materializedPath, staleMaterialization.artifact_digest);
        if (!existsSync(materializedPath)) {
          try {
            await rename(replacedPath, materializedPath);
          } catch (restoreError) {
            if (existsSync(materializedPath)) {
              invalidateStaleTrust();
            } else {
              throw new AggregateError([error, restoreError], "Materialization and backup restoration both failed");
            }
          }
        } else {
          invalidateStaleTrust();
        }
      }
      throw error;
    }
  }
}
