import { randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { readServerSyncConfig } from "./config.server";

export const LOCAL_DATABASE_FILENAME = "benchmark-history.sqlite";
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function defaultLegacyDataRoot(): string {
  return join(PROJECT_ROOT, "data");
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function databaseHasTable(database: DatabaseSync, name: string): boolean {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function reconcileDefaultOfflineIdentity(databasePath: string, provisionedClientId: string): void {
  // A default offline-only store may have used an automatic client id. Rebind it when first provisioned;
  // synchronized stores remain identity-bound and are rejected instead of silently changing ownership.
  const database = new DatabaseSync(databasePath);
  try {
    if (!databaseHasTable(database, "local_identity")) return;
    const identity = database.prepare("SELECT client_id FROM local_identity WHERE singleton = 1").get() as
      | { client_id: string }
      | undefined;
    if (!identity || identity.client_id === provisionedClientId) return;

    let synchronizedState = false;
    if (databaseHasTable(database, "sync_state")) {
      synchronizedState =
        database
          .prepare("SELECT 1 FROM sync_state WHERE cursor IS NOT NULL OR last_sync_at IS NOT NULL LIMIT 1")
          .get() !== undefined;
    }
    if (!synchronizedState && databaseHasTable(database, "benchmark_runs")) {
      const columns = database.prepare("PRAGMA table_info(benchmark_runs)").all() as Array<{ name: string }>;
      if (columns.some((column) => column.name === "sync_status")) {
        synchronizedState =
          database
            .prepare("SELECT 1 FROM benchmark_runs WHERE sync_status IN ('remote', 'synced') LIMIT 1")
            .get() !== undefined;
      }
    }
    if (synchronizedState) {
      throw new Error("Legacy data contains synchronized state and cannot be rebound to a different client identity");
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare("UPDATE local_identity SET client_id = ? WHERE singleton = 1 AND client_id = ?")
        .run(provisionedClientId, identity.client_id);
      if (databaseHasTable(database, "benchmark_runs")) {
        const columns = database.prepare("PRAGMA table_info(benchmark_runs)").all() as Array<{ name: string }>;
        if (columns.some((column) => column.name === "origin_client_id")) {
          database
            .prepare("UPDATE benchmark_runs SET origin_client_id = ? WHERE origin_client_id = ?")
            .run(provisionedClientId, identity.client_id);
        }
      }
      if (databaseHasTable(database, "sync_outbox")) {
        const operations = database.prepare("SELECT operation_id, payload_json FROM sync_outbox").all() as Array<{
          operation_id: string;
          payload_json: string;
        }>;
        const updatePayload = database.prepare("UPDATE sync_outbox SET payload_json = ? WHERE operation_id = ?");
        for (const operation of operations) {
          const payload = parseJsonObject(operation.payload_json);
          const run = payload.run;
          if (run && typeof run === "object" && !Array.isArray(run)) {
            const runPayload = run as Record<string, unknown>;
            if (runPayload.originClientId === identity.client_id) {
              runPayload.originClientId = provisionedClientId;
              updatePayload.run(JSON.stringify(payload), operation.operation_id);
            }
          }
        }
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

export class LocalStore {
  readonly clientId: string;
  readonly principalId: string;
  readonly hostId: string;
  readonly installationId: string;
  readonly dataRoot: string;
  readonly databasePath: string;
  readonly #database: DatabaseSync;

  constructor(dataRoot: string, provisionedClientId?: string) {
    if (provisionedClientId && !CLIENT_ID_PATTERN.test(provisionedClientId)) {
      throw new Error("Provisioned sync client id must be a UUIDv4");
    }
    this.dataRoot = resolve(dataRoot);
    this.databasePath = join(this.dataRoot, LOCAL_DATABASE_FILENAME);
    mkdirSync(this.dataRoot, { recursive: true, mode: 0o700 });
    this.#database = new DatabaseSync(this.databasePath);
    this.#database.exec("PRAGMA journal_mode = WAL;");
    this.#database.exec("PRAGMA busy_timeout = 5000;");
    this.#database.exec("PRAGMA synchronous = NORMAL;");
    this.#database.exec("PRAGMA foreign_keys = ON;");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS local_identity (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        client_id TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL,
        host_id TEXT NOT NULL,
        installation_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
    `);
    this.#addLocalIdentityColumn("principal_id", "TEXT");
    this.#addLocalIdentityColumn("host_id", "TEXT");
    this.#addLocalIdentityColumn("installation_id", "TEXT");
    const clientId = provisionedClientId ?? randomUUID();
    this.#database
      .prepare(
        `INSERT OR IGNORE INTO local_identity (
          singleton, client_id, principal_id, host_id, installation_id, created_at
        ) VALUES (1, ?, ?, ?, ?, ?)`,
      )
      .run(clientId, randomUUID(), randomUUID(), clientId, new Date().toISOString());
    this.#database
      .prepare(
        `UPDATE local_identity
         SET principal_id = COALESCE(principal_id, ?),
             host_id = COALESCE(host_id, ?),
             installation_id = COALESCE(installation_id, client_id)
         WHERE singleton = 1`,
      )
      .run(randomUUID(), randomUUID());
    const identity = this.#database
      .prepare(
        `SELECT client_id, principal_id, host_id, installation_id
         FROM local_identity WHERE singleton = 1`,
      )
      .get() as { client_id: string; principal_id: string; host_id: string; installation_id: string };
    if (provisionedClientId && identity.client_id !== provisionedClientId) {
      this.#database.close();
      throw new Error("Local data root is bound to a different client identity");
    }
    this.clientId = identity.client_id;
    this.principalId = identity.principal_id;
    this.hostId = identity.host_id;
    this.installationId = identity.installation_id;
    this.#migrate();
  }

  #addLocalIdentityColumn(name: string, definition: string) {
    const columns = this.#database.prepare("PRAGMA table_info(local_identity)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name)) {
      this.#database.exec(`ALTER TABLE local_identity ADD COLUMN ${name} ${definition}`);
    }
  }

  #migrate() {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.exec(`
        CREATE TABLE IF NOT EXISTS benchmark_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          benchmark_id TEXT NOT NULL,
          benchmark_name TEXT NOT NULL,
          agent_id TEXT,
          agent_model TEXT,
          reasoning_effort TEXT,
          service_tier TEXT,
          run_duration_ms INTEGER,
          solution_path TEXT NOT NULL,
          score_model TEXT NOT NULL,
          scorecard_path TEXT,
          rubric_snapshot TEXT NOT NULL,
          scorecard_content TEXT NOT NULL DEFAULT '',
          scorecard_data TEXT NOT NULL DEFAULT '{}',
          metrics TEXT NOT NULL DEFAULT '{}',
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          run_uid TEXT,
          origin_client_id TEXT,
          solution_rel_path TEXT,
          artifact_digest TEXT,
          sync_status TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS sync_outbox (
          operation_id TEXT PRIMARY KEY,
          run_uid TEXT NOT NULL,
          operation_type TEXT NOT NULL CHECK (operation_type IN ('upsert', 'delete')),
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'failed')),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT,
          dead_lettered_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS sync_outbox_pending_idx
          ON sync_outbox (status, next_attempt_at, created_at);

        CREATE TABLE IF NOT EXISTS sync_state (
          scope TEXT PRIMARY KEY,
          cursor TEXT,
          last_sync_at TEXT,
          last_error TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_artifacts (
          artifact_digest TEXT PRIMARY KEY,
          archive_path TEXT NOT NULL,
          manifest_json TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          file_count INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'ready',
          materialized_path TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS artifact_materializations (
          artifact_digest TEXT NOT NULL,
          materialized_path TEXT NOT NULL UNIQUE,
          verified_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (artifact_digest, materialized_path),
          FOREIGN KEY (artifact_digest) REFERENCES local_artifacts(artifact_digest) ON DELETE CASCADE
        );

      `);

      this.#addBenchmarkRunColumn("run_duration_ms", "INTEGER");
      this.#addBenchmarkRunColumn("scorecard_content", "TEXT NOT NULL DEFAULT ''");
      this.#addBenchmarkRunColumn("scorecard_data", "TEXT NOT NULL DEFAULT '{}'");
      this.#addBenchmarkRunColumn("metrics", "TEXT NOT NULL DEFAULT '{}'");
      this.#addBenchmarkRunColumn("run_uid", "TEXT");
      this.#addBenchmarkRunColumn("origin_client_id", "TEXT");
      this.#addBenchmarkRunColumn("solution_rel_path", "TEXT");
      this.#addBenchmarkRunColumn("artifact_digest", "TEXT");
      this.#addBenchmarkRunColumn("sync_status", "TEXT NOT NULL DEFAULT 'pending'");
      this.#addSyncOutboxColumn("dead_lettered_at", "TEXT");
      this.#addLocalArtifactColumn("materialized_path", "TEXT");
      this.#database.exec(`
        DELETE FROM artifact_materializations
        WHERE rowid NOT IN (
          SELECT MAX(rowid) FROM artifact_materializations GROUP BY materialized_path
        );
        CREATE UNIQUE INDEX IF NOT EXISTS artifact_materializations_path_idx
          ON artifact_materializations (materialized_path);
      `);
      this.#database.exec(`
        INSERT OR IGNORE INTO artifact_materializations (
          artifact_digest, materialized_path, verified_at, updated_at
        )
        SELECT artifact_digest, materialized_path, updated_at, updated_at
        FROM local_artifacts
        WHERE materialized_path IS NOT NULL
        ORDER BY updated_at DESC
      `);

      this.#database.exec("UPDATE benchmark_runs SET scorecard_content = rubric_snapshot WHERE scorecard_content = ''");
      const legacyRows = this.#database
        .prepare(
          `SELECT id, run_uid, origin_client_id, solution_path, solution_rel_path
           FROM benchmark_runs
           WHERE run_uid IS NULL OR run_uid = ''
              OR origin_client_id IS NULL OR origin_client_id = ''
              OR solution_rel_path IS NULL`,
        )
        .all() as Array<{
        id: number;
        run_uid: string | null;
        origin_client_id: string | null;
        solution_path: string;
        solution_rel_path: string | null;
      }>;
      const backfill = this.#database.prepare(
        `UPDATE benchmark_runs
         SET run_uid = ?, origin_client_id = ?, solution_rel_path = ?
         WHERE id = ?`,
      );
      for (const row of legacyRows) {
        const solutionRelPath =
          row.solution_rel_path ?? (isAbsolute(row.solution_path) ? null : row.solution_path.replaceAll("\\", "/"));
        backfill.run(row.run_uid || randomUUID(), row.origin_client_id || this.clientId, solutionRelPath, row.id);
      }

      const now = new Date().toISOString();
      const pendingLegacyRows = this.#database
        .prepare(
          `SELECT * FROM benchmark_runs AS run
           WHERE run.sync_status = 'pending'
             AND NOT EXISTS (
               SELECT 1 FROM sync_outbox AS operation
               WHERE operation.run_uid = run.run_uid AND operation.operation_type = 'upsert'
             )`,
        )
        .all() as Array<Record<string, unknown>>;
      const enqueueLegacy = this.#database.prepare(
        `INSERT INTO sync_outbox (
          operation_id, run_uid, operation_type, payload_json, status, created_at, updated_at
        ) VALUES (?, ?, 'upsert', ?, 'pending', ?, ?)`,
      );
      for (const row of pendingLegacyRows) {
        const payload = {
          version: 1,
          run: {
            runUid: String(row.run_uid),
            originClientId: String(row.origin_client_id),
            benchmarkId: String(row.benchmark_id),
            benchmarkName: String(row.benchmark_name),
            agentId: row.agent_id === null ? null : String(row.agent_id),
            agentModel: row.agent_model === null ? null : String(row.agent_model),
            reasoningEffort: row.reasoning_effort === null ? null : String(row.reasoning_effort),
            serviceTier: row.service_tier === null ? null : String(row.service_tier),
            runDurationMs: row.run_duration_ms === null ? null : Number(row.run_duration_ms),
            solutionRelPath: row.solution_rel_path === null ? null : String(row.solution_rel_path),
            artifactDigest: row.artifact_digest === null ? null : String(row.artifact_digest),
            scoreModel: String(row.score_model),
            scorecardContent: String(row.scorecard_content),
            scorecardData: parseJsonObject(row.scorecard_data),
            metrics: parseJsonObject(row.metrics),
            notes: String(row.notes),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
          },
        };
        enqueueLegacy.run(randomUUID(), String(row.run_uid), JSON.stringify(payload), now, now);
      }
      this.#database
        .prepare("INSERT OR IGNORE INTO sync_state (scope, cursor, updated_at) VALUES ('remote', NULL, ?)")
        .run(now);
      this.#database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS benchmark_runs_run_uid_idx ON benchmark_runs (run_uid);
        CREATE INDEX IF NOT EXISTS benchmark_runs_benchmark_created_idx
          ON benchmark_runs (benchmark_id, created_at DESC);
        PRAGMA user_version = 1;
      `);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #addBenchmarkRunColumn(name: string, definition: string) {
    const columns = this.#database.prepare("PRAGMA table_info(benchmark_runs)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name)) {
      this.#database.exec(`ALTER TABLE benchmark_runs ADD COLUMN ${name} ${definition}`);
    }
  }

  #addSyncOutboxColumn(name: string, definition: string) {
    const columns = this.#database.prepare("PRAGMA table_info(sync_outbox)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name)) {
      this.#database.exec(`ALTER TABLE sync_outbox ADD COLUMN ${name} ${definition}`);
    }
  }

  #addLocalArtifactColumn(name: string, definition: string) {
    const columns = this.#database.prepare("PRAGMA table_info(local_artifacts)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name)) {
      this.#database.exec(`ALTER TABLE local_artifacts ADD COLUMN ${name} ${definition}`);
    }
  }

  prepare(sql: string) {
    return this.#database.prepare(sql);
  }

  transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.#database.close();
  }
}

export function openLocalStore({
  dataRoot,
  legacyDataRoot,
  clientId,
}: {
  dataRoot?: string;
  legacyDataRoot?: string;
  clientId?: string;
} = {}) {
  const config = readServerSyncConfig();
  const resolvedDataRoot = resolve(dataRoot ?? config.dataRoot);
  const resolvedLegacyRoot = legacyDataRoot
    ? resolve(legacyDataRoot)
    : dataRoot === undefined
      ? defaultLegacyDataRoot()
      : null;
  const databasePath = join(resolvedDataRoot, LOCAL_DATABASE_FILENAME);
  const legacyDatabasePath = resolvedLegacyRoot ? join(resolvedLegacyRoot, LOCAL_DATABASE_FILENAME) : null;
  let migratedDatabase = false;
  if (
    legacyDatabasePath &&
    legacyDatabasePath !== databasePath &&
    !existsSync(databasePath) &&
    existsSync(legacyDatabasePath)
  ) {
    mkdirSync(resolvedDataRoot, { recursive: true, mode: 0o700 });
    const temporaryDatabasePath = join(
      resolvedDataRoot,
      `.${LOCAL_DATABASE_FILENAME}.legacy-${randomUUID()}.tmp`,
    );
    const legacy = new DatabaseSync(legacyDatabasePath, { readOnly: true });
    try {
      legacy.exec(`VACUUM INTO '${temporaryDatabasePath.replaceAll("'", "''")}'`);
    } finally {
      legacy.close();
    }
    try {
      linkSync(temporaryDatabasePath, databasePath);
      migratedDatabase = true;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    } finally {
      rmSync(temporaryDatabasePath, { force: true });
    }
  }
  const provisionedClientId = clientId ?? (dataRoot === undefined ? config.credentials?.clientId : undefined);
  try {
    if (legacyDataRoot !== undefined && provisionedClientId && existsSync(databasePath)) {
      reconcileDefaultOfflineIdentity(databasePath, provisionedClientId);
    }
    return new LocalStore(resolvedDataRoot, provisionedClientId);
  } catch (error) {
    if (migratedDatabase) {
      rmSync(databasePath, { force: true });
      rmSync(`${databasePath}-wal`, { force: true });
      rmSync(`${databasePath}-shm`, { force: true });
    }
    throw error;
  }
}
