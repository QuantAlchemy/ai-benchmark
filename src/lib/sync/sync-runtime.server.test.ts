import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRunHistoryStore } from "../run-history.server";
import { createScorecardData } from "../scorecard";
import { openLocalStore } from "./local-store.server";
import { ensureRunSolution, getSyncStatus } from "./sync-runtime.server";

const roots: string[] = [];
async function root(prefix: string) {
  const value = await mkdtemp(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("sync runtime", () => {
  it("does not apply ambient credentials to an explicit custom data root", async () => {
    const dataRoot = await root("sync-runtime-explicit-data-");
    const projectRoot = await root("sync-runtime-explicit-project-");
    const ambientClientId = "99999999-9999-4999-8999-999999999999";
    const previous = {
      url: process.env.AI_BENCHMARK_SYNC_URL,
      clientId: process.env.AI_BENCHMARK_SYNC_CLIENT_ID,
      token: process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN,
    };
    process.env.AI_BENCHMARK_SYNC_URL = "https://ambient.convex.site";
    process.env.AI_BENCHMARK_SYNC_CLIENT_ID = ambientClientId;
    process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN = "ambient-runtime-token";
    try {
      const status = await getSyncStatus({ dataRoot, projectRoot });
      expect(status.configured).toBe(false);
      expect(status.clientId).not.toBe(ambientClientId);
    } finally {
      if (previous.url === undefined) delete process.env.AI_BENCHMARK_SYNC_URL;
      else process.env.AI_BENCHMARK_SYNC_URL = previous.url;
      if (previous.clientId === undefined) delete process.env.AI_BENCHMARK_SYNC_CLIENT_ID;
      else process.env.AI_BENCHMARK_SYNC_CLIENT_ID = previous.clientId;
      if (previous.token === undefined) delete process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN;
      else process.env.AI_BENCHMARK_SYNC_CLIENT_TOKEN = previous.token;
    }
  });

  it("uses the shared ensure operation without requiring network for an existing local solution", async () => {
    const dataRoot = await root("sync-runtime-data-");
    const projectRoot = await root("sync-runtime-project-");
    const solutionPath = join(projectRoot, "solutions", "benchmark", "run");
    await mkdir(solutionPath, { recursive: true });
    await writeFile(join(solutionPath, "index.html"), "<!doctype html>\n");
    const history = createRunHistoryStore({ dataRoot, projectRoot });
    const scorecardContent = "# Scorecard\n";
    const run = history.createBenchmarkRun({
      benchmarkId: "benchmark",
      benchmarkName: "Benchmark",
      solutionPath,
      scoreModel: "manual",
      scorecardContent,
      scorecardData: createScorecardData(scorecardContent),
    });
    history.close();

    await expect(ensureRunSolution(run.id, { dataRoot, projectRoot, credentials: null })).resolves.toBe(solutionPath);
    await expect(getSyncStatus({ dataRoot, projectRoot, credentials: null })).resolves.toMatchObject({
      configured: false,
      pendingOperations: 1,
      failedOperations: 0,
      databasePath: join(dataRoot, "benchmark-history.sqlite"),
    });
  });

  it("reports active, failed, and dead-lettered outbox counts separately", async () => {
    const dataRoot = await root("sync-runtime-counts-data-");
    const projectRoot = await root("sync-runtime-counts-project-");
    const history = createRunHistoryStore({ dataRoot, projectRoot });
    for (const name of ["active", "failed", "dead"] as const) {
      history.createBenchmarkRun({
        benchmarkId: name,
        benchmarkName: name,
        solutionPath: join(projectRoot, "solutions", name),
        scoreModel: "manual",
        scorecardContent: "# Scorecard",
        scorecardData: createScorecardData("# Scorecard"),
      });
    }
    history.close();
    const store = openLocalStore({ dataRoot });
    store
      .prepare(
        `UPDATE sync_outbox SET status = 'failed'
         WHERE rowid = (SELECT rowid FROM sync_outbox ORDER BY rowid LIMIT 1 OFFSET 1)`,
      )
      .run();
    store
      .prepare(
        `UPDATE sync_outbox SET status = 'failed', dead_lettered_at = '2026-01-01T00:00:00.000Z'
         WHERE rowid = (SELECT MAX(rowid) FROM sync_outbox)`,
      )
      .run();
    store.close();

    await expect(getSyncStatus({ dataRoot, projectRoot, credentials: null })).resolves.toMatchObject({
      pendingOperations: 1,
      failedOperations: 1,
      deadLetteredOperations: 1,
    });
  });

  it("never trusts a pre-existing directory for an unmaterialized remote artifact", async () => {
    const dataRoot = await root("sync-runtime-remote-data-");
    const projectRoot = await root("sync-runtime-remote-project-");
    const solutionPath = join(projectRoot, "solutions", "remote-run");
    await mkdir(solutionPath, { recursive: true });
    await writeFile(join(solutionPath, "index.html"), "unverified local content");
    const history = createRunHistoryStore({ dataRoot, projectRoot });
    const run = history.createBenchmarkRun({
      benchmarkId: "remote-example",
      benchmarkName: "Remote Example",
      solutionPath,
      scoreModel: "judge",
      scorecardContent: "# Scorecard",
      scorecardData: createScorecardData("# Scorecard"),
    });
    history.close();
    const store = openLocalStore({ dataRoot });
    store
      .prepare("UPDATE benchmark_runs SET origin_client_id = ?, artifact_digest = ? WHERE id = ?")
      .run("88888888-8888-4888-8888-888888888888", "a".repeat(64), run.id);
    store.close();

    await expect(
      ensureRunSolution(run.id, { dataRoot, projectRoot, credentials: null }),
    ).rejects.toThrow("remote synchronization is not configured");
  });
});
