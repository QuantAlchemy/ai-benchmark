import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { validateRunPush } from "../../convex/protocol";
import { createScorecardData } from "./scorecard";
import { createRunHistoryStore } from "./run-history.server";
import { openLocalStore } from "./sync/local-store.server";
import { getSyncStatus } from "./sync/sync-runtime.server";

const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "ai-benchmark-run-history-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function runInput(projectRoot: string) {
  const scorecardContent = "# Scorecard\n\n## Correctness\n";
  return {
    benchmarkId: "benchmark-one",
    benchmarkName: "Benchmark One",
    agentId: "codex",
    solutionPath: join(projectRoot, "benchmarks/benchmark-one/solutions/run-a"),
    scoreModel: "judge-model",
    scorecardContent,
    scorecardData: createScorecardData(scorecardContent),
  };
}

describe("run history sync outbox", () => {
  it("imports the legacy repository database through the default run-history entry point", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = temporaryRoot();
    const legacyDataRoot = temporaryRoot();
    const legacy = new DatabaseSync(join(legacyDataRoot, "benchmark-history.sqlite"));
    legacy.exec("CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('legacy');");
    legacy.close();
    writeFileSync(join(projectRoot, ".env"), `AI_BENCHMARK_DATA_ROOT=${dataRoot}\n`);

    const history = createRunHistoryStore({ projectRoot, legacyDataRoot });
    history.close();

    const imported = new DatabaseSync(join(dataRoot, "benchmark-history.sqlite"), { readOnly: true });
    expect(imported.prepare("SELECT value FROM marker").get()).toEqual({ value: "legacy" });
    imported.close();
  });

  it("rebinds an unprovisioned legacy identity when the default data root is provisioned", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = temporaryRoot();
    const legacyDataRoot = temporaryRoot();
    const legacyHistory = createRunHistoryStore({ dataRoot: legacyDataRoot, projectRoot });
    legacyHistory.createBenchmarkRun(runInput(projectRoot));
    legacyHistory.close();
    const provisionedClientId = "55555555-5555-4555-8555-555555555555";
    writeFileSync(
      join(projectRoot, ".env"),
      [
        `AI_BENCHMARK_DATA_ROOT=${dataRoot}`,
        "AI_BENCHMARK_SYNC_URL=https://example.convex.site",
        `AI_BENCHMARK_SYNC_CLIENT_ID=${provisionedClientId}`,
        "AI_BENCHMARK_SYNC_CLIENT_TOKEN=server-only-token",
        "",
      ].join("\n"),
    );

    const migrated = createRunHistoryStore({ projectRoot, legacyDataRoot });
    const [run] = migrated.listBenchmarkRuns();
    migrated.close();

    expect(run?.originClientId).toBe(provisionedClientId);
    const imported = new DatabaseSync(join(dataRoot, "benchmark-history.sqlite"), { readOnly: true });
    expect(imported.prepare("SELECT client_id FROM local_identity WHERE singleton = 1").get()).toEqual({
      client_id: provisionedClientId,
    });
    const queued = imported.prepare("SELECT payload_json FROM sync_outbox").all() as Array<{ payload_json: string }>;
    expect(queued).not.toHaveLength(0);
    expect(queued.every(({ payload_json }) => JSON.parse(payload_json).run.originClientId === provisionedClientId)).toBe(true);
    imported.close();
  });

  it("reconciles a default offline store when credentials are provisioned after its first open", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = temporaryRoot();
    writeFileSync(join(projectRoot, ".env"), `AI_BENCHMARK_DATA_ROOT=${dataRoot}\n`);
    const offlineHistory = createRunHistoryStore({ projectRoot });
    offlineHistory.createBenchmarkRun(runInput(projectRoot));
    offlineHistory.close();
    const provisionedClientId = "55555555-5555-4555-8555-555555555555";
    writeFileSync(
      join(projectRoot, ".env"),
      [
        `AI_BENCHMARK_DATA_ROOT=${dataRoot}`,
        "AI_BENCHMARK_SYNC_URL=https://example.convex.site",
        `AI_BENCHMARK_SYNC_CLIENT_ID=${provisionedClientId}`,
        "AI_BENCHMARK_SYNC_CLIENT_TOKEN=server-only-token",
        "",
      ].join("\n"),
    );

    const provisioned = createRunHistoryStore({ projectRoot });
    const [run] = provisioned.listBenchmarkRuns();
    provisioned.close();

    expect(run?.originClientId).toBe(provisionedClientId);
  });

  it("keeps a previously synchronized legacy identity bound and removes the rejected copy", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = temporaryRoot();
    const legacyDataRoot = temporaryRoot();
    const legacy = openLocalStore({
      dataRoot: legacyDataRoot,
      clientId: "44444444-4444-4444-8444-444444444444",
    });
    legacy
      .prepare(
        "UPDATE sync_state SET cursor = '5', last_sync_at = '2026-01-01T00:00:00.000Z' WHERE scope = 'remote'",
      )
      .run();
    legacy.close();
    writeFileSync(
      join(projectRoot, ".env"),
      [
        `AI_BENCHMARK_DATA_ROOT=${dataRoot}`,
        "AI_BENCHMARK_SYNC_URL=https://example.convex.site",
        "AI_BENCHMARK_SYNC_CLIENT_ID=55555555-5555-4555-8555-555555555555",
        "AI_BENCHMARK_SYNC_CLIENT_TOKEN=server-only-token",
        "",
      ].join("\n"),
    );

    expect(() => createRunHistoryStore({ projectRoot, legacyDataRoot })).toThrow("synchronized state");
    expect(existsSync(join(dataRoot, "benchmark-history.sqlite"))).toBe(false);
  });

  it("imports the legacy repository database through the sync-status entry point", async () => {
    const dataRoot = temporaryRoot();
    const projectRoot = temporaryRoot();
    const legacyDataRoot = temporaryRoot();
    const legacy = new DatabaseSync(join(legacyDataRoot, "benchmark-history.sqlite"));
    legacy.exec("CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('legacy-status');");
    legacy.close();
    writeFileSync(join(projectRoot, ".env"), `AI_BENCHMARK_DATA_ROOT=${dataRoot}\n`);

    await getSyncStatus({ projectRoot, legacyDataRoot });

    const imported = new DatabaseSync(join(dataRoot, "benchmark-history.sqlite"), { readOnly: true });
    expect(imported.prepare("SELECT value FROM marker").get()).toEqual({ value: "legacy-status" });
    imported.close();
  });

  it("binds default run writes to the provisioned opaque client identity", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = temporaryRoot();
    const clientId = "55555555-5555-4555-8555-555555555555";
    writeFileSync(
      join(projectRoot, ".env"),
      [
        `AI_BENCHMARK_DATA_ROOT=${dataRoot}`,
        "AI_BENCHMARK_SYNC_URL=https://example.convex.site",
        `AI_BENCHMARK_SYNC_CLIENT_ID=${clientId}`,
        "AI_BENCHMARK_SYNC_CLIENT_TOKEN=server-only-token",
        "",
      ].join("\n"),
    );

    const history = createRunHistoryStore({ dataRoot, projectRoot });
    const run = history.createBenchmarkRun(runInput(projectRoot));
    history.close();

    expect(run.originClientId).toBe(clientId);
  });

  it("creates a stable run uid and queues the snapshot in the same local database", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = resolve("/tmp/ai-benchmark-project");
    const history = createRunHistoryStore({ dataRoot, projectRoot });

    const run = history.createBenchmarkRun(runInput(projectRoot));
    history.close();

    expect(run.id).toBe(1);
    expect(run.runUid).toMatch(/^[0-9a-f-]{36}$/);
    expect(run.solutionRelPath).toBe("benchmarks/benchmark-one/solutions/run-a");
    expect(run.syncStatus).toBe("pending");

    const database = new DatabaseSync(join(dataRoot, "benchmark-history.sqlite"), { readOnly: true });
    const operation = database.prepare("SELECT * FROM sync_outbox").get() as Record<string, unknown>;
    const payload = JSON.parse(String(operation.payload_json)) as { run: { runUid: string; id?: number } };

    expect(operation.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(operation.operation_type).toBe("upsert");
    expect(operation.run_uid).toBe(run.runUid);
    expect(payload.run.runUid).toBe(run.runUid);
    expect(payload.run.id).toBeUndefined();
    database.close();
  });

  it("updates a run and queues the updated snapshot", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = resolve("/tmp/ai-benchmark-project");
    const history = createRunHistoryStore({ dataRoot, projectRoot });
    const created = history.createBenchmarkRun(runInput(projectRoot));
    const scorecardContent = "# Updated scorecard";

    const updated = history.updateBenchmarkRun({
      id: created.id,
      scoreModel: "new-judge",
      scorecardData: createScorecardData(scorecardContent),
      notes: "updated offline",
    });
    history.close();

    expect(updated.id).toBe(created.id);
    expect(updated.runUid).toBe(created.runUid);
    expect(updated.notes).toBe("updated offline");
    expect(updated.syncStatus).toBe("pending");

    const database = new DatabaseSync(join(dataRoot, "benchmark-history.sqlite"), { readOnly: true });
    const operations = database.prepare("SELECT * FROM sync_outbox ORDER BY created_at, rowid").all() as Array<
      Record<string, unknown>
    >;
    expect(operations).toHaveLength(2);
    expect(JSON.parse(String(operations[1].payload_json)).run.notes).toBe("updated offline");
    database.close();
  });

  it("updates metrics and queues the measured snapshot", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = resolve("/tmp/ai-benchmark-project");
    const history = createRunHistoryStore({ dataRoot, projectRoot });
    const created = history.createBenchmarkRun(runInput(projectRoot));

    const measured = history.updateBenchmarkRunMetrics(created.id, { agentDurationMs: 1234 });
    history.close();

    expect(measured.metrics.agentDurationMs).toBe(1234);
    const database = new DatabaseSync(join(dataRoot, "benchmark-history.sqlite"), { readOnly: true });
    const operations = database.prepare("SELECT payload_json FROM sync_outbox ORDER BY rowid").all() as Array<{
      payload_json: string;
    }>;
    expect(operations).toHaveLength(2);
    expect(JSON.parse(operations[1].payload_json).run.metrics.agentDurationMs).toBe(1234);
    database.close();
  });

  it("deletes a run and queues a portable tombstone atomically", () => {
    const dataRoot = temporaryRoot();
    const projectRoot = resolve("/tmp/ai-benchmark-project");
    const history = createRunHistoryStore({ dataRoot, projectRoot });
    const created = history.createBenchmarkRun(runInput(projectRoot));

    const deleted = history.deleteBenchmarkRun(created.id);
    history.close();

    expect(deleted.runUid).toBe(created.runUid);
    const database = new DatabaseSync(join(dataRoot, "benchmark-history.sqlite"), { readOnly: true });
    expect(database.prepare("SELECT id FROM benchmark_runs WHERE id = ?").get(created.id)).toBeUndefined();
    const tombstone = database
      .prepare("SELECT * FROM sync_outbox WHERE operation_type = 'delete'")
      .get() as Record<string, unknown>;
    expect(tombstone.run_uid).toBe(created.runUid);
    const payload = JSON.parse(String(tombstone.payload_json));
    expect(payload).toMatchObject({ version: 1, runUid: created.runUid });
    expect(payload.solutionPath).toBeUndefined();
    expect(
      validateRunPush({
        operationId: tombstone.operation_id,
        runUid: tombstone.run_uid,
        eventKind: "tombstone",
        payloadJson: tombstone.payload_json,
      }),
    ).toMatchObject({ runUid: created.runUid, eventKind: "tombstone" });
    database.close();
  });
});
