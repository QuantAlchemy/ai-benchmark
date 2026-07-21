import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readServerSyncConfig, type ServerSyncConfig } from "./config.server";
import { ConvexHttpSyncTransport } from "./convex-transport.server";
import { openLocalStore } from "./local-store.server";
import { SyncService, type SyncResult } from "./sync-service.server";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_SYNC_INTERVAL_MS = 30_000;

type RuntimeOptions = {
  dataRoot?: string;
  projectRoot?: string;
  credentials?: ServerSyncConfig["credentials"];
};

function runtimeConfig(options: RuntimeOptions = {}) {
  const configured = readServerSyncConfig({ projectRoot: options.projectRoot ?? PROJECT_ROOT });
  const dataRoot = resolve(options.dataRoot ?? configured.dataRoot);
  const inheritConfiguredCredentials = options.dataRoot === undefined || dataRoot === resolve(configured.dataRoot);
  return {
    dataRoot,
    projectRoot: resolve(options.projectRoot ?? PROJECT_ROOT),
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
  const store = openLocalStore({ dataRoot: config.dataRoot, clientId: config.credentials?.clientId });
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

export async function getSyncStatus(options: RuntimeOptions = {}) {
  const config = runtimeConfig(options);
  const store = openLocalStore({ dataRoot: config.dataRoot, clientId: config.credentials?.clientId });
  try {
    const pending = store.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get() as { count: number };
    const failed = store.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'failed'").get() as {
      count: number;
    };
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
