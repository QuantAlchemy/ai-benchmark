import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readServerSyncConfig, type ServerSyncConfig } from "./config.server";
import { ConvexHttpSyncTransport } from "./convex-transport.server";
import { defaultLegacyDataRoot, openLocalStore } from "./local-store.server";
import { SyncService, type SyncResult } from "./sync-service.server";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_SYNC_INTERVAL_MS = 30_000;

type RuntimeOptions = {
  dataRoot?: string;
  projectRoot?: string;
  legacyDataRoot?: string;
  credentials?: ServerSyncConfig["credentials"];
};

function runtimeConfig(options: RuntimeOptions = {}) {
  const configured = readServerSyncConfig({ projectRoot: options.projectRoot ?? PROJECT_ROOT });
  const dataRoot = resolve(options.dataRoot ?? configured.dataRoot);
  const inheritConfiguredCredentials = options.dataRoot === undefined || dataRoot === resolve(configured.dataRoot);
  return {
    dataRoot,
    projectRoot: resolve(options.projectRoot ?? PROJECT_ROOT),
    legacyDataRoot:
      options.dataRoot === undefined ? resolve(options.legacyDataRoot ?? defaultLegacyDataRoot()) : undefined,
    credentials:
      options.credentials === undefined
        ? inheritConfiguredCredentials
          ? configured.credentials
          : null
        : options.credentials,
  };
}

function createService(options: RuntimeOptions = {}): SyncService | null {
  const config = runtimeConfig(options);
  if (!config.credentials) return null;
  return new SyncService({
    dataRoot: config.dataRoot,
    legacyDataRoot: config.legacyDataRoot,
    projectRoot: config.projectRoot,
    clientId: config.credentials.clientId,
    transport: new ConvexHttpSyncTransport({
      baseUrl: config.credentials.url,
      clientToken: config.credentials.clientToken,
    }),
  });
}

export async function ensureRunSolution(runId: number, options: RuntimeOptions = {}): Promise<string> {
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error("Invalid benchmark run id");
  const config = runtimeConfig(options);
  const store = openLocalStore({ dataRoot: config.dataRoot, legacyDataRoot: config.legacyDataRoot, clientId: config.credentials?.clientId });
  try {
    const run = store
      .prepare("SELECT solution_path, origin_client_id, artifact_digest FROM benchmark_runs WHERE id = ?")
      .get(runId) as
      | { solution_path: string; origin_client_id: string; artifact_digest: string | null }
      | undefined;
    if (!run) throw new Error(`No benchmark run with id "${runId}".`);
    if (existsSync(run.solution_path)) {
      if (run.origin_client_id === store.clientId) return run.solution_path;
      if (run.artifact_digest) {
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
        if (materialization !== undefined) return run.solution_path;
      }
    }
  } finally {
    store.close();
  }
  const service = createService(config);
  if (!service) throw new Error("The solution is not local and remote synchronization is not configured");
  return await service.ensureMaterialized(runId);
}

export async function syncNow(options: RuntimeOptions = {}): Promise<SyncResult | null> {
  return await runSync(options, true);
}

async function runSync(options: RuntimeOptions, force: boolean): Promise<SyncResult | null> {
  const service = createService(options);
  return service ? await service.syncOnce({ force }) : null;
}

type FailedSyncOperation = {
  operationId: string;
  runUid: string;
  operationType: "upsert" | "delete";
  attemptCount: number;
  deadLetteredAt: string | null;
  lastError: string | null;
};

function requireOperationId(operationId: string): void {
  if (!operationId || operationId.length > 200 || /[\r\n]/.test(operationId)) {
    throw new Error("Invalid sync operation id");
  }
}

export function getFailedSyncOperations(options: RuntimeOptions = {}): FailedSyncOperation[] {
  const config = runtimeConfig(options);
  const store = openLocalStore({ dataRoot: config.dataRoot, legacyDataRoot: config.legacyDataRoot, clientId: config.credentials?.clientId });
  try {
    const rows = store
      .prepare(
        `SELECT operation_id, run_uid, operation_type, attempt_count, dead_lettered_at, last_error
         FROM sync_outbox WHERE status = 'failed' ORDER BY created_at, rowid`,
      )
      .all() as Array<{
      operation_id: string;
      run_uid: string;
      operation_type: "upsert" | "delete";
      attempt_count: number;
      dead_lettered_at: string | null;
      last_error: string | null;
    }>;
    return rows.map((row) => ({
      operationId: row.operation_id,
      runUid: row.run_uid,
      operationType: row.operation_type,
      attemptCount: row.attempt_count,
      deadLetteredAt: row.dead_lettered_at,
      lastError: row.last_error,
    }));
  } finally {
    store.close();
  }
}

export function retrySyncOperation(operationId: string, options: RuntimeOptions = {}): void {
  requireOperationId(operationId);
  const config = runtimeConfig(options);
  const store = openLocalStore({ dataRoot: config.dataRoot, legacyDataRoot: config.legacyDataRoot, clientId: config.credentials?.clientId });
  try {
    const result = store
      .prepare(
        `UPDATE sync_outbox
         SET status = 'pending', attempt_count = 0, next_attempt_at = NULL, dead_lettered_at = NULL,
             last_error = NULL, updated_at = ?
         WHERE operation_id = ? AND status = 'failed'`,
      )
      .run(new Date().toISOString(), operationId);
    if (Number(result.changes) !== 1) throw new Error(`No failed sync operation with id "${operationId}".`);
  } finally {
    store.close();
  }
}

export function discardSyncOperation(operationId: string, options: RuntimeOptions = {}): void {
  requireOperationId(operationId);
  const config = runtimeConfig(options);
  const store = openLocalStore({ dataRoot: config.dataRoot, legacyDataRoot: config.legacyDataRoot, clientId: config.credentials?.clientId });
  try {
    store.transaction(() => {
      const operation = store
        .prepare("SELECT run_uid, status FROM sync_outbox WHERE operation_id = ?")
        .get(operationId) as { run_uid: string; status: string } | undefined;
      if (!operation || operation.status !== "failed") {
        throw new Error(`No failed sync operation with id "${operationId}".`);
      }
      store.prepare("DELETE FROM sync_outbox WHERE operation_id = ?").run(operationId);
      store
        .prepare(
          `UPDATE benchmark_runs
           SET sync_status = CASE WHEN origin_client_id = ? THEN 'local' ELSE 'remote' END
           WHERE run_uid = ? AND NOT EXISTS (
             SELECT 1 FROM sync_outbox WHERE run_uid = ?
           )`,
        )
        .run(store.clientId, operation.run_uid, operation.run_uid);
    });
  } finally {
    store.close();
  }
}

export async function getSyncStatus(options: RuntimeOptions = {}) {
  const config = runtimeConfig(options);
  const store = openLocalStore({ dataRoot: config.dataRoot, legacyDataRoot: config.legacyDataRoot, clientId: config.credentials?.clientId });
  try {
    const pending = store
      .prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status IN ('pending', 'processing')")
      .get() as { count: number };
    const failed = store
      .prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'failed' AND dead_lettered_at IS NULL")
      .get() as { count: number };
    const deadLettered = store
      .prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE dead_lettered_at IS NOT NULL")
      .get() as { count: number };
    const state = store.prepare("SELECT cursor, last_sync_at, last_error FROM sync_state WHERE scope = 'remote'").get() as
      | { cursor: string | null; last_sync_at: string | null; last_error: string | null }
      | undefined;
    return {
      configured: config.credentials !== null,
      dataRoot: config.dataRoot,
      databasePath: store.databasePath,
      clientId: store.clientId,
      principalId: store.principalId,
      hostId: store.hostId,
      installationId: store.installationId,
      pendingOperations: Number(pending.count),
      failedOperations: Number(failed.count),
      deadLetteredOperations: Number(deadLettered.count),
      cursor: state?.cursor ?? "0",
      lastSyncAt: state?.last_sync_at ?? null,
      lastError: state?.last_error ?? null,
    };
  } finally {
    store.close();
  }
}

let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let activeSync: Promise<void> | null = null;

export function scheduleSync(delayMs = 0): void {
  if (scheduledTimer || activeSync || !runtimeConfig().credentials) return;
  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    activeSync = runSync({}, false)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        activeSync = null;
      });
  }, Math.max(0, delayMs));
  scheduledTimer.unref?.();
}

export function startSyncWorker(intervalMs = DEFAULT_SYNC_INTERVAL_MS): void {
  if (intervalTimer || !runtimeConfig().credentials) return;
  scheduleSync();
  intervalTimer = setInterval(() => scheduleSync(), Math.max(1_000, intervalMs));
  intervalTimer.unref?.();
}

export function stopSyncWorker(): void {
  if (scheduledTimer) clearTimeout(scheduledTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  scheduledTimer = null;
  intervalTimer = null;
}
