import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { validateRunPush } from "../../convex/protocol";
import { createScorecardData } from "./scorecard";
import { createRunHistoryStore } from "./run-history.server";

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
