import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchmarkRun } from "./db/schema";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { createScorecardData, normalizeScorecardData, type ScorecardData } from "./scorecard";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "benchmark-history.sqlite");
const require = createRequire(import.meta.url);

type BenchmarkRunRow = {
  id: number;
  benchmark_id: string;
  benchmark_name: string;
  agent_id: string | null;
  agent_model: string | null;
  reasoning_effort: string | null;
  service_tier: string | null;
  run_duration_ms: number | null;
  solution_path: string;
  score_model: string;
  scorecard_path: string | null;
  scorecard_content: string;
  scorecard_data: string | null;
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
  notes?: string;
};

type UpdateBenchmarkRunInput = {
  id: number;
  scoreModel: string;
  scorecardData: ScorecardData;
  notes: string;
};

type DatabaseSyncConstructor = typeof DatabaseSyncType;

let DatabaseSync: DatabaseSyncConstructor | null = null;
let db: InstanceType<DatabaseSyncConstructor> | null = null;

function loadDatabaseSync() {
  if (DatabaseSync) return DatabaseSync;

  const emitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    if (args[0] === "ExperimentalWarning" && String(warning).includes("SQLite")) return;
    return (emitWarning as (...emitArgs: unknown[]) => void)(warning, ...args);
  }) as typeof process.emitWarning;

  try {
    DatabaseSync = require("node:sqlite").DatabaseSync as DatabaseSyncConstructor;
  } finally {
    process.emitWarning = emitWarning;
  }

  return DatabaseSync;
}

function getDb() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const Database = loadDatabaseSync();
  db ??= new Database(DB_PATH);
  db.exec(`
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
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS benchmark_runs_benchmark_created_idx
      ON benchmark_runs (benchmark_id, created_at DESC);
  `);
  const columns = db.prepare("PRAGMA table_info(benchmark_runs)").all() as Array<{ name: string }>;
  const hasScorecardContent = columns.some((column) => column.name === "scorecard_content");
  if (!hasScorecardContent) {
    db.exec("ALTER TABLE benchmark_runs ADD COLUMN scorecard_content TEXT NOT NULL DEFAULT ''");
  }
  const refreshedColumns = db.prepare("PRAGMA table_info(benchmark_runs)").all() as Array<{ name: string }>;
  const hasScorecardData = refreshedColumns.some((column) => column.name === "scorecard_data");
  if (!hasScorecardData) {
    db.exec("ALTER TABLE benchmark_runs ADD COLUMN scorecard_data TEXT NOT NULL DEFAULT '{}'");
  }
  const latestColumns = db.prepare("PRAGMA table_info(benchmark_runs)").all() as Array<{ name: string }>;
  const hasRunDurationMs = latestColumns.some((column) => column.name === "run_duration_ms");
  if (!hasRunDurationMs) {
    db.exec("ALTER TABLE benchmark_runs ADD COLUMN run_duration_ms INTEGER");
  }
  db.exec("UPDATE benchmark_runs SET scorecard_content = rubric_snapshot WHERE scorecard_content = ''");
  const rowsNeedingData = db
    .prepare("SELECT id, scorecard_content, rubric_snapshot FROM benchmark_runs WHERE scorecard_data = '{}' OR scorecard_data = ''")
    .all() as Array<{ id: number; scorecard_content: string; rubric_snapshot?: string }>;
  const updateData = db.prepare("UPDATE benchmark_runs SET scorecard_data = ? WHERE id = ?");
  for (const row of rowsNeedingData) {
    const source = row.scorecard_content || row.rubric_snapshot || "";
    updateData.run(JSON.stringify(createScorecardData(source)), row.id);
  }
  return db;
}

function normalizeRun(row: BenchmarkRunRow): BenchmarkRun {
  return {
    id: row.id,
    benchmarkId: row.benchmark_id,
    benchmarkName: row.benchmark_name,
    agentId: row.agent_id,
    agentModel: row.agent_model,
    reasoningEffort: row.reasoning_effort,
    serviceTier: row.service_tier,
    runDurationMs: row.run_duration_ms,
    solutionPath: row.solution_path,
    scoreModel: row.score_model,
    scorecardPath: row.scorecard_path,
    scorecardContent: row.scorecard_content || row.rubric_snapshot || "",
    scorecardData: normalizeScorecardData(parseJson(row.scorecard_data), row.scorecard_content || row.rubric_snapshot || ""),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listBenchmarkRuns(benchmarkId?: string): BenchmarkRun[] {
  const database = getDb();
  const rows = benchmarkId
    ? database
        .prepare("SELECT * FROM benchmark_runs WHERE benchmark_id = ? ORDER BY created_at DESC, id DESC")
        .all(benchmarkId)
    : database.prepare("SELECT * FROM benchmark_runs ORDER BY created_at DESC, id DESC").all();

  return (rows as BenchmarkRunRow[]).map(normalizeRun);
}

export function createBenchmarkRun(input: CreateBenchmarkRunInput): BenchmarkRun {
  const database = getDb();
  const now = new Date().toISOString();
  const result = database
    .prepare(
      `
      INSERT INTO benchmark_runs (
        benchmark_id,
        benchmark_name,
        agent_id,
        agent_model,
        reasoning_effort,
        service_tier,
        run_duration_ms,
        solution_path,
        score_model,
        scorecard_path,
        rubric_snapshot,
        scorecard_content,
        scorecard_data,
        notes,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
    )
    .get(
      input.benchmarkId,
      input.benchmarkName,
      input.agentId || null,
      input.agentModel || null,
      input.reasoningEffort || null,
      input.serviceTier || null,
      input.runDurationMs ?? null,
      input.solutionPath,
      input.scoreModel,
      input.scorecardPath || null,
      input.scorecardContent,
      input.scorecardContent,
      JSON.stringify(input.scorecardData),
      input.notes ?? "",
      now,
      now,
    ) as BenchmarkRunRow;

  return normalizeRun(result);
}

export function updateBenchmarkRun(input: UpdateBenchmarkRunInput): BenchmarkRun {
  const database = getDb();
  const now = new Date().toISOString();
  const updated = database
    .prepare(
      `
      UPDATE benchmark_runs
      SET score_model = ?, scorecard_data = ?, notes = ?, updated_at = ?
      WHERE id = ?
      RETURNING *
    `,
    )
    .get(input.scoreModel, JSON.stringify(input.scorecardData), input.notes, now, input.id) as
    | BenchmarkRunRow
    | undefined;

  if (!updated) throw new Error(`No benchmark run with id "${input.id}".`);
  return normalizeRun(updated);
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function deleteBenchmarkRun(id: number): BenchmarkRun {
  const database = getDb();
  const deleted = database.prepare("DELETE FROM benchmark_runs WHERE id = ? RETURNING *").get(id) as
    | BenchmarkRunRow
    | undefined;

  if (!deleted) throw new Error(`No benchmark run with id "${id}".`);
  return normalizeRun(deleted);
}
