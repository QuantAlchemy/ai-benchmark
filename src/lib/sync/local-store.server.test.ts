import { closeSync, mkdtempSync, openSync, readdirSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { defaultLegacyDataRoot, openLocalStore } from "./local-store.server";

const temporaryRoots: string[] = [];

function temporaryRoot(name: string) {
  const root = mkdtempSync(join(tmpdir(), `ai-benchmark-${name}-`));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("local synchronization store", () => {
  it("does not bind an explicit data root to ambient synchronization credentials", () => {
    const dataRoot = temporaryRoot("explicit-root-");
    const ambientClientId = "77777777-7777-4777-8777-777777777777";
    const previous = {
      url: process.env.AI_BENCHMARK_SYNC_URL,
      clientId: process.env.AI_BENCHMARK_SYNC_CLIENT_ID,
      token: process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN,
    };
    process.env.AI_BENCHMARK_SYNC_URL = "https://example.convex.site";
    process.env.AI_BENCHMARK_SYNC_CLIENT_ID = ambientClientId;
    process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN = "ambient-token";
    try {
      const store = openLocalStore({ dataRoot });
      expect(store.clientId).not.toBe(ambientClientId);
      store.close();
    } finally {
      for (const [key, value] of Object.entries({
        AI_BENCHMARK_SYNC_URL: previous.url,
        AI_BENCHMARK_SYNC_CLIENT_ID: previous.clientId,
        AI_BENCHMARK_SYNC_CLIENT_TOKEN: previous.token,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("reconciles a default offline store even when no legacy root argument is passed", () => {
    const dataRoot = temporaryRoot("default-reconcile-");
    const offline = openLocalStore({ dataRoot });
    const offlineClientId = offline.clientId;
    offline.close();
    const provisionedClientId = "88888888-8888-4888-8888-888888888888";
    const previous = {
      dataRoot: process.env.AI_BENCHMARK_DATA_ROOT,
      url: process.env.AI_BENCHMARK_SYNC_URL,
      clientId: process.env.AI_BENCHMARK_SYNC_CLIENT_ID,
      token: process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN,
    };
    process.env.AI_BENCHMARK_DATA_ROOT = dataRoot;
    process.env.AI_BENCHMARK_SYNC_URL = "https://example.convex.site";
    process.env.AI_BENCHMARK_SYNC_CLIENT_ID = provisionedClientId;
    process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN = "ambient-token";
    try {
      const provisioned = openLocalStore();
      expect(provisioned.clientId).toBe(provisionedClientId);
      expect(provisioned.clientId).not.toBe(offlineClientId);
      provisioned.close();
    } finally {
      for (const [key, value] of Object.entries({
        AI_BENCHMARK_DATA_ROOT: previous.dataRoot,
        AI_BENCHMARK_SYNC_URL: previous.url,
        AI_BENCHMARK_SYNC_CLIENT_ID: previous.clientId,
        AI_BENCHMARK_SYNC_CLIENT_TOKEN: previous.token,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("resolves the legacy repository database independently of the process working directory", () => {
    const originalWorkingDirectory = process.cwd();
    const unrelatedWorkingDirectory = temporaryRoot("unrelated-cwd");
    const expected = defaultLegacyDataRoot();
    try {
      process.chdir(unrelatedWorkingDirectory);
      expect(defaultLegacyDataRoot()).toBe(expected);
    } finally {
      process.chdir(originalWorkingDirectory);
    }
    expect(expected).toMatch(/\/data$/);
  });

  it("persists one opaque client identity per data root", () => {
    const rootA = temporaryRoot("replica-a");
    const rootB = temporaryRoot("replica-b");

    const firstA = openLocalStore({ dataRoot: rootA });
    const clientA = firstA.clientId;
    firstA.close();

    const reopenedA = openLocalStore({ dataRoot: rootA });
    const replicaB = openLocalStore({ dataRoot: rootB });

    expect(reopenedA.clientId).toBe(clientA);
    expect(replicaB.clientId).not.toBe(clientA);
    expect(clientA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const identities = new DatabaseSync(join(rootA, "benchmark-history.sqlite"), { readOnly: true });
    const identity = identities.prepare("SELECT * FROM local_identity WHERE singleton = 1").get() as Record<
      string,
      unknown
    >;
    expect(identity).toMatchObject({ client_id: clientA, installation_id: clientA });
    expect(identity.principal_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(identity.host_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(identity.principal_id).not.toBe(identity.host_id);
    expect(identity.principal_id).not.toBe(identity.installation_id);
    identities.close();

    reopenedA.close();
    replicaB.close();
  });

  it("uses WAL and a busy timeout so the UI and background sync worker can share the database", () => {
    const store = openLocalStore({ dataRoot: temporaryRoot("concurrency") });
    expect(store.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(store.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
    store.close();
  });

  it("seeds a fresh installation from its provisioned opaque client id and never silently replaces it", () => {
    const dataRoot = temporaryRoot("provisioned");
    const provisionedClientId = "11111111-1111-4111-8111-111111111111";
    const first = openLocalStore({ dataRoot, clientId: provisionedClientId });
    expect(first.clientId).toBe(provisionedClientId);
    first.close();

    expect(() =>
      openLocalStore({ dataRoot, clientId: "22222222-2222-4222-8222-222222222222" }),
    ).toThrow("different client identity");
  });

  it("migrates legacy rows and adds durable sync tables without changing numeric ids", () => {
    const dataRoot = temporaryRoot("legacy");
    const databasePath = join(dataRoot, "benchmark-history.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE benchmark_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        benchmark_id TEXT NOT NULL,
        benchmark_name TEXT NOT NULL,
        agent_id TEXT,
        agent_model TEXT,
        reasoning_effort TEXT,
        service_tier TEXT,
        solution_path TEXT NOT NULL,
        score_model TEXT NOT NULL,
        scorecard_path TEXT,
        rubric_snapshot TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO benchmark_runs (
        id, benchmark_id, benchmark_name, solution_path, score_model,
        rubric_snapshot, notes, created_at, updated_at
      ) VALUES (
        41, 'legacy-benchmark', 'Legacy Benchmark', 'solutions/legacy', 'judge',
        '# Legacy rubric', 'keep me', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
    `);
    legacy.close();

    const store = openLocalStore({ dataRoot });
    const clientId = store.clientId;
    store.close();

    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    const row = migrated.prepare("SELECT * FROM benchmark_runs WHERE id = 41").get() as Record<string, unknown>;
    const tables = new Set(
      (migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
        ({ name }) => name,
      ),
    );

    expect(row).toMatchObject({
      id: 41,
      benchmark_id: "legacy-benchmark",
      notes: "keep me",
      origin_client_id: clientId,
      solution_rel_path: "solutions/legacy",
      artifact_digest: null,
      sync_status: "pending",
    });
    expect(row.run_uid).toMatch(/^[0-9a-f-]{36}$/);
    const outbox = migrated.prepare("SELECT * FROM sync_outbox WHERE run_uid = ?").get(String(row.run_uid)) as Record<
      string,
      unknown
    >;
    expect(outbox).toMatchObject({ operation_type: "upsert", status: "pending" });
    expect(outbox.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(outbox.payload_json))).toMatchObject({
      version: 1,
      run: {
        runUid: row.run_uid,
        originClientId: clientId,
        benchmarkId: "legacy-benchmark",
        solutionRelPath: "solutions/legacy",
        notes: "keep me",
      },
    });
    expect([...tables]).toEqual(
      expect.arrayContaining([
        "benchmark_runs",
        "local_identity",
        "sync_outbox",
        "sync_state",
        "local_artifacts",
        "artifact_materializations",
      ]),
    );
    migrated.close();
  });

  it("migrates legacy singleton materialization metadata into per-path trust records", () => {
    const dataRoot = temporaryRoot("materialization-migration");
    const digest = "a".repeat(64);
    const materializedPath = join(dataRoot, "solutions", "one");
    const first = openLocalStore({ dataRoot });
    first
      .prepare(
        `INSERT INTO local_artifacts (
           artifact_digest, archive_path, manifest_json, size_bytes, file_count, status,
           materialized_path, created_at, updated_at
         ) VALUES (?, ?, '{"version":1,"files":[],"totalExpandedBytes":0}', 1, 0, 'ready', ?, ?, ?)`,
      )
      .run(digest, join(dataRoot, "artifacts", `${digest}.tar.gz`), materializedPath, "2026-01-01", "2026-01-01");
    first.close();

    const migrated = openLocalStore({ dataRoot });
    expect(
      migrated
        .prepare("SELECT artifact_digest, materialized_path FROM artifact_materializations")
        .get(),
    ).toEqual({ artifact_digest: digest, materialized_path: materializedPath });
    const secondDigest = "b".repeat(64);
    migrated
      .prepare(
        `INSERT INTO local_artifacts (
           artifact_digest, archive_path, manifest_json, size_bytes, file_count, status, created_at, updated_at
         ) VALUES (?, ?, '{}', 1, 0, 'ready', '2026-01-02', '2026-01-02')`,
      )
      .run(secondDigest, join(dataRoot, "artifacts", `${secondDigest}.tar.gz`));
    expect(() =>
      migrated
        .prepare(
          `INSERT INTO artifact_materializations (artifact_digest, materialized_path, verified_at, updated_at)
           VALUES (?, ?, '2026-01-02', '2026-01-02')`,
        )
        .run(secondDigest, materializedPath),
    ).toThrow(/UNIQUE/);
    migrated.close();
  });

  it("keeps pending outbox operations across a close and reopen", () => {
    const dataRoot = temporaryRoot("restart");
    const first = openLocalStore({ dataRoot });
    first
      .prepare(
        `INSERT INTO sync_outbox (
          operation_id, run_uid, operation_type, payload_json, status, created_at, updated_at
        ) VALUES ('operation-1', 'run-1', 'upsert', '{}', 'pending', '2026-01-01', '2026-01-01')`,
      )
      .run();
    first.close();

    const reopened = openLocalStore({ dataRoot });
    expect(reopened.prepare("SELECT operation_id FROM sync_outbox WHERE status = 'pending'").get()).toEqual({
      operation_id: "operation-1",
    });
    reopened.close();
  });

  it("copies a legacy repository database once without overwriting an existing per-user database", () => {
    const legacyDataRoot = temporaryRoot("legacy-root");
    const dataRoot = temporaryRoot("xdg-root");
    const legacy = new DatabaseSync(join(legacyDataRoot, "benchmark-history.sqlite"));
    legacy.exec("CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('legacy');");
    legacy.close();

    const migrated = openLocalStore({ dataRoot, legacyDataRoot });
    expect(migrated.prepare("SELECT value FROM marker").get()).toEqual({ value: "legacy" });
    migrated.prepare("UPDATE marker SET value = 'local'").run();
    migrated.close();

    const reopened = openLocalStore({ dataRoot, legacyDataRoot });
    expect(reopened.prepare("SELECT value FROM marker").get()).toEqual({ value: "local" });
    reopened.close();
  });

  it("removes a partial temporary database when VACUUM INTO fails", () => {
    const legacyDataRoot = temporaryRoot("corrupt-legacy-root");
    const dataRoot = temporaryRoot("failed-vacuum-target");
    const legacyPath = join(legacyDataRoot, "benchmark-history.sqlite");
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec("CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES(quote(randomblob(1000)));");
    legacy.close();

    const descriptor = openSync(legacyPath, "r+");
    writeSync(descriptor, Buffer.from([0]), 0, 1, 4096);
    closeSync(descriptor);

    expect(() => openLocalStore({ dataRoot, legacyDataRoot })).toThrow(/malformed/);
    expect(readdirSync(dataRoot).filter((name) => name.includes(".legacy-") && name.endsWith(".tmp"))).toEqual([]);
  });
});
