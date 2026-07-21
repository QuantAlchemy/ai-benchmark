import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchmarkRun } from "./db/schema";
import { normalizeRunMetrics, type RunMetrics } from "./metrics";
import { createScorecardData, normalizeScorecardData, type ScorecardData } from "./scorecard";
import { readServerSyncConfig } from "./sync/config.server";
import { openLocalStore, type LocalStore } from "./sync/local-store.server";
import { scheduleSync } from "./sync/sync-runtime.server";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

type BenchmarkRunRow = {
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
  scorecard_path: string | null;
  scorecard_content: string;
  scorecard_data: string | null;
  metrics: string | null;
  rubric_snapshot?: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type CreateBenchmarkRunInput = {
  benchmarkId: string;
  benchmarkName: string;
  agentId?: string | null;
  agentModel?: string | null;
  reasoningEffort?: string | null;
  serviceTier?: string | null;
  runDurationMs?: number | null;
  solutionPath: string;
  scoreModel: string;
  scorecardPath?: string | null;
  scorecardContent: string;
  scorecardData: ScorecardData;
  metrics?: RunMetrics;
  notes?: string;
};

type UpdateBenchmarkRunInput = {
  id: number;
  scoreModel: string;
  scorecardData: ScorecardData;
  notes: string;
};

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeRun(row: BenchmarkRunRow): BenchmarkRun {
  return {
    id: row.id,
    runUid: row.run_uid,
    originClientId: row.origin_client_id,
    benchmarkId: row.benchmark_id,
    benchmarkName: row.benchmark_name,
    agentId: row.agent_id,
    agentModel: row.agent_model,
    reasoningEffort: row.reasoning_effort,
    serviceTier: row.service_tier,
    runDurationMs: row.run_duration_ms,
    solutionPath: row.solution_path,
    solutionRelPath: row.solution_rel_path,
    artifactDigest: row.artifact_digest,
    syncStatus: row.sync_status,
    scoreModel: row.score_model,
    scorecardPath: row.scorecard_path,
    scorecardContent: row.scorecard_content || row.rubric_snapshot || "",
    scorecardData: normalizeScorecardData(parseJson(row.scorecard_data), row.scorecard_content || row.rubric_snapshot || ""),
    metrics: normalizeRunMetrics(parseJson(row.metrics), row.run_duration_ms),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function portableSolutionPath(projectRoot: string, solutionPath: string) {
  const candidate = relative(projectRoot, resolve(solutionPath));
  if (!candidate || candidate === ".." || candidate.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(candidate)) {
    return null;
  }
  return candidate.replaceAll("\\", "/");
}

function syncPayload(run: BenchmarkRun) {
  return {
    version: 1,
    run: {
      runUid: run.runUid,
      originClientId: run.originClientId,
      benchmarkId: run.benchmarkId,
      benchmarkName: run.benchmarkName,
      agentId: run.agentId,
      agentModel: run.agentModel,
      reasoningEffort: run.reasoningEffort,
      serviceTier: run.serviceTier,
      runDurationMs: run.runDurationMs,
      solutionRelPath: run.solutionRelPath,
      artifactDigest: run.artifactDigest,
      scoreModel: run.scoreModel,
      scorecardContent: run.scorecardContent,
      scorecardData: run.scorecardData,
      metrics: run.metrics,
      notes: run.notes,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    },
  };
}

export class RunHistoryStore {
  readonly #localStore: LocalStore;
  readonly #projectRoot: string;

  constructor(localStore: LocalStore, projectRoot: string) {
    this.#localStore = localStore;
    this.#projectRoot = resolve(projectRoot);
  }

  listBenchmarkRuns(benchmarkId?: string): BenchmarkRun[] {
    const rows = benchmarkId
      ? this.#localStore
          .prepare("SELECT * FROM benchmark_runs WHERE benchmark_id = ? ORDER BY created_at DESC, id DESC")
          .all(benchmarkId)
      : this.#localStore.prepare("SELECT * FROM benchmark_runs ORDER BY created_at DESC, id DESC").all();
    return (rows as BenchmarkRunRow[]).map(normalizeRun);
  }

  createBenchmarkRun(input: CreateBenchmarkRunInput): BenchmarkRun {
    return this.#localStore.transaction(() => {
      const now = new Date().toISOString();
      const runUid = randomUUID();
      const result = this.#localStore
        .prepare(
          `INSERT INTO benchmark_runs (
            run_uid, origin_client_id, benchmark_id, benchmark_name, agent_id, agent_model,
            reasoning_effort, service_tier, run_duration_ms, solution_path, solution_rel_path,
            artifact_digest, sync_status, score_model, scorecard_path, rubric_snapshot,
            scorecard_content, scorecard_data, metrics, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *`,
        )
        .get(
          runUid,
          this.#localStore.clientId,
          input.benchmarkId,
          input.benchmarkName,
          input.agentId || null,
          input.agentModel || null,
          input.reasoningEffort || null,
          input.serviceTier || null,
          input.runDurationMs ?? null,
          input.solutionPath,
          portableSolutionPath(this.#projectRoot, input.solutionPath),
          input.scoreModel,
          input.scorecardPath || null,
          input.scorecardContent,
          input.scorecardContent,
          JSON.stringify(input.scorecardData),
          JSON.stringify(normalizeRunMetrics(input.metrics, input.runDurationMs ?? null)),
          input.notes ?? "",
          now,
          now,
        ) as BenchmarkRunRow;
      const run = normalizeRun(result);
      this.#queue("upsert", run.runUid, syncPayload(run), now);
      return run;
    });
  }

  updateBenchmarkRun(input: UpdateBenchmarkRunInput): BenchmarkRun {
    return this.#localStore.transaction(() => {
      const now = new Date().toISOString();
      const updated = this.#localStore
        .prepare(
          `UPDATE benchmark_runs
           SET score_model = ?, scorecard_data = ?, notes = ?, sync_status = 'pending', updated_at = ?
           WHERE id = ?
           RETURNING *`,
        )
        .get(input.scoreModel, JSON.stringify(input.scorecardData), input.notes, now, input.id) as
        | BenchmarkRunRow
        | undefined;
      if (!updated) throw new Error(`No benchmark run with id "${input.id}".`);
      const run = normalizeRun(updated);
      this.#queue("upsert", run.runUid, syncPayload(run), now);
      return run;
    });
  }

  updateBenchmarkRunMetrics(id: number, patch: Partial<RunMetrics>): BenchmarkRun {
    return this.#localStore.transaction(() => {
      const row = this.#localStore.prepare("SELECT * FROM benchmark_runs WHERE id = ?").get(id) as
        | BenchmarkRunRow
        | undefined;
      if (!row) throw new Error(`No benchmark run with id "${id}".`);

      const current = normalizeRunMetrics(parseJson(row.metrics), row.run_duration_ms);
      const next = { ...current, ...patch, version: 1 as const };
      const now = new Date().toISOString();
      const updated = this.#localStore
        .prepare(
          "UPDATE benchmark_runs SET metrics = ?, sync_status = 'pending', updated_at = ? WHERE id = ? RETURNING *",
        )
        .get(JSON.stringify(next), now, id) as BenchmarkRunRow;
      const run = normalizeRun(updated);
      this.#queue("upsert", run.runUid, syncPayload(run), now);
      return run;
    });
  }

  deleteBenchmarkRun(id: number): BenchmarkRun {
    return this.#localStore.transaction(() => {
      const row = this.#localStore.prepare("SELECT * FROM benchmark_runs WHERE id = ?").get(id) as
        | BenchmarkRunRow
        | undefined;
      if (!row) throw new Error(`No benchmark run with id "${id}".`);
      const run = normalizeRun(row);
      const now = new Date().toISOString();
      this.#localStore.prepare("DELETE FROM benchmark_runs WHERE id = ?").run(id);
      this.#queue("delete", run.runUid, { version: 1, runUid: run.runUid, deletedAt: now }, now);
      return run;
    });
  }

  #queue(operationType: "upsert" | "delete", runUid: string, payload: unknown, now: string) {
    this.#localStore
      .prepare(
        `INSERT INTO sync_outbox (
          operation_id, run_uid, operation_type, payload_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(randomUUID(), runUid, operationType, JSON.stringify(payload), now, now);
  }

  close() {
    this.#localStore.close();
  }
}

export function createRunHistoryStore({
  dataRoot,
  projectRoot = ROOT,
}: {
  dataRoot?: string;
  projectRoot?: string;
} = {}) {
  const config = readServerSyncConfig({ projectRoot });
  const resolvedDataRoot = resolve(dataRoot ?? config.dataRoot);
  const clientId =
    config.credentials && resolve(config.dataRoot) === resolvedDataRoot ? config.credentials.clientId : undefined;
  return new RunHistoryStore(openLocalStore({ dataRoot: resolvedDataRoot, clientId }), projectRoot);
}

let defaultStore: RunHistoryStore | null = null;

function getDefaultStore() {
  defaultStore ??= createRunHistoryStore();
  return defaultStore;
}

export function listBenchmarkRuns(benchmarkId?: string): BenchmarkRun[] {
  return getDefaultStore().listBenchmarkRuns(benchmarkId);
}

export function createBenchmarkRun(input: CreateBenchmarkRunInput): BenchmarkRun {
  const run = getDefaultStore().createBenchmarkRun(input);
  scheduleSync();
  return run;
}

export function updateBenchmarkRun(input: UpdateBenchmarkRunInput): BenchmarkRun {
  const run = getDefaultStore().updateBenchmarkRun(input);
  scheduleSync();
  return run;
}

export function updateBenchmarkRunMetrics(id: number, patch: Partial<RunMetrics>): BenchmarkRun {
  const run = getDefaultStore().updateBenchmarkRunMetrics(id, patch);
  scheduleSync();
  return run;
}

export function deleteBenchmarkRun(id: number): BenchmarkRun {
  const run = getDefaultStore().deleteBenchmarkRun(id);
  scheduleSync();
  return run;
}
