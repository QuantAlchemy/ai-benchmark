import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listAgents, runAgentOnBenchmark, type AgentStatus } from "../../lib/agents.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BENCHMARKS_DIR = join(ROOT, "benchmarks");
const SOLUTIONS_DIR = join(ROOT, "solutions");
const REQUIRED_FIELDS = ["id", "name", "summary"] as const;

export type BenchmarkManifest = {
  id: string;
  name: string;
  summary: string;
  category?: string;
  difficulty?: string;
  source?: {
    description?: string;
    deployed_url?: string;
    repos?: Array<{
      name: string;
      url: string;
      commit?: string;
      subpath?: string;
    }>;
  };
  scripts?: {
    setup?: string;
    verify?: string;
  };
  files?: {
    task?: string;
    rubric?: string;
  };
  dir: string;
  manifestPath: string;
};

export type DashboardBenchmark = BenchmarkManifest & {
  defaultSolution: string;
  sourceFetched: boolean;
  solutionExists: boolean;
  results: Array<{
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
  }>;
};

export type CommandResult = {
  ok: boolean;
  exitCode: number;
  command: string;
  durationMs: number;
  output: string;
};

export type BenchmarkAgent = AgentStatus;

function parseManifest(dir: string): BenchmarkManifest | null {
  const manifestPath = join(dir, "benchmark.json");
  if (!existsSync(manifestPath)) return null;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<BenchmarkManifest>;
  const missing = REQUIRED_FIELDS.filter((field) => !manifest[field]);
  if (missing.length) {
    throw new Error(`${manifestPath} is missing required field(s): ${missing.join(", ")}`);
  }

  return { ...manifest, dir, manifestPath } as BenchmarkManifest;
}

function listManifests() {
  if (!existsSync(BENCHMARKS_DIR)) return [];
  return readdirSync(BENCHMARKS_DIR)
    .map((name) => join(BENCHMARKS_DIR, name))
    .filter((path) => statSync(path).isDirectory())
    .map(parseManifest)
    .filter((benchmark): benchmark is BenchmarkManifest => Boolean(benchmark))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getManifest(id: string) {
  const found = listManifests().find((benchmark) => benchmark.id === id);
  if (!found) {
    const ids = listManifests().map((benchmark) => benchmark.id);
    const hint = ids.length ? ` Available: ${ids.join(", ")}` : "";
    throw new Error(`No benchmark with id "${id}".${hint}`);
  }
  return found;
}

function defaultSolutionPath(benchmark: Pick<BenchmarkManifest, "id">) {
  return join(SOLUTIONS_DIR, benchmark.id);
}

function listResults(dir: string) {
  const resultsDir = join(dir, "results");
  if (!existsSync(resultsDir)) return [];

  return readdirSync(resultsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const path = join(resultsDir, name);
      const stats = statSync(path);
      return {
        name,
        path,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function getDashboardData(): DashboardBenchmark[] {
  return listManifests().map((benchmark) => {
    const defaultSolution = defaultSolutionPath(benchmark);
    return {
      ...benchmark,
      defaultSolution,
      sourceFetched: existsSync(join(benchmark.dir, "source")),
      solutionExists: existsSync(defaultSolution),
      results: listResults(benchmark.dir),
    };
  });
}

export function getBenchmarkAgents(): BenchmarkAgent[] {
  return listAgents();
}

export function getBenchmarkFiles(id: string) {
  const benchmark = getManifest(id);

  const readDeclaredFile = (key: "task" | "rubric") => {
    const rel = benchmark.files?.[key] ?? `${key.toUpperCase()}.md`;
    const path = join(benchmark.dir, rel);
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf8");
  };

  const readmePath = join(benchmark.dir, "README.md");

  return {
    benchmark,
    task: readDeclaredFile("task"),
    rubric: readDeclaredFile("rubric"),
    readme: existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "",
  };
}

export async function runBenchmarkScript(id: string, scriptKey: "setup" | "verify", solution?: string): Promise<CommandResult> {
  const benchmark = getManifest(id);
  const rel = benchmark.scripts?.[scriptKey];
  if (!rel) throw new Error(`Benchmark "${benchmark.id}" declares no "${scriptKey}" script.`);

  const scriptPath = join(benchmark.dir, rel);
  if (!existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`);

  const requestedSolution = solution?.trim();
  const defaultSolution = defaultSolutionPath(benchmark);
  const requestedPath = requestedSolution ? resolve(requestedSolution) : "";
  const solutionPath = requestedPath === resolve(SOLUTIONS_DIR) ? resolve(defaultSolution) : resolve(requestedSolution || defaultSolution);
  const usingDefaultSolution = solutionPath === resolve(defaultSolution);
  if (scriptKey === "verify" && !existsSync(solutionPath)) {
    if (usingDefaultSolution) {
      mkdirSync(solutionPath, { recursive: true });
      return {
        ok: false,
        exitCode: 2,
        command: `bash ${scriptPath}`,
        durationMs: 0,
        output: `Created default solution directory: ${solutionPath}\n\nPlace the candidate files there, then run verify again.`,
      };
    } else {
      return {
        ok: false,
        exitCode: 2,
        command: `bash ${scriptPath}`,
        durationMs: 0,
        output: `Solution path does not exist: ${solutionPath}\n\nPass a solution path, or place it at ${defaultSolution}.`,
      };
    }
  }
  if (scriptKey === "verify" && usingDefaultSolution && readdirSync(solutionPath).length === 0) {
    return {
      ok: false,
      exitCode: 2,
      command: `bash ${scriptPath}`,
      durationMs: 0,
      output: `Default solution directory is empty: ${solutionPath}\n\nPlace the candidate files there, then run verify again.`,
    };
  }

  const startedAt = Date.now();
  const env = {
    ...process.env,
    BENCH_ID: benchmark.id,
    BENCH_DIR: benchmark.dir,
    BENCH_SOURCE: join(benchmark.dir, "source"),
    BENCH_SOLUTION: solutionPath,
  };

  return new Promise((resolvePromise, reject) => {
    const chunks: string[] = [];
    const child = spawn("bash", [scriptPath], {
      cwd: benchmark.dir,
      env,
    });

    child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const exitCode = code ?? 1;
      resolvePromise({
        ok: exitCode === 0,
        exitCode,
        command: `bash ${scriptPath}`,
        durationMs: Date.now() - startedAt,
        output: chunks.join("").trimEnd(),
      });
    });
  });
}

export async function runBenchmarkAgent(
  id: string,
  agent: string,
  model?: string,
  solution?: string,
): Promise<CommandResult> {
  const benchmark = getManifest(id);
  return runAgentOnBenchmark(benchmark, { agent, model, solution });
}

export function createScorecard(id: string, modelName: string, force: boolean): CommandResult & { path?: string } {
  const benchmark = getManifest(id);
  const rubricRel = benchmark.files?.rubric ?? "RUBRIC.md";
  const rubricPath = join(benchmark.dir, rubricRel);
  if (!existsSync(rubricPath)) throw new Error(`No rubric at ${rubricPath}`);

  const model = modelName.trim() || "candidate";
  const stamp = new Date().toISOString().slice(0, 10);
  const resultsDir = join(benchmark.dir, "results");
  mkdirSync(resultsDir, { recursive: true });

  const safeModel = model.replace(/[^a-z0-9._-]+/gi, "-");
  const out = join(resultsDir, `${stamp}__${safeModel}.md`);
  if (existsSync(out) && !force) {
    return {
      ok: false,
      exitCode: 1,
      command: "scorecard",
      durationMs: 0,
      output: `Scorecard already exists: ${out}\nEnable force overwrite to replace it.`,
      path: out,
    };
  }

  const header =
    `<!-- Scorecard generated by ai-benchmark -->\n` +
    `# Scorecard - ${benchmark.name}\n\n` +
    `- **Model:** ${model}\n` +
    `- **Date:** ${stamp}\n` +
    `- **Benchmark:** ${benchmark.id}\n\n` +
    `> Fill in the score columns below, then save. This is a copy of the rubric;\n` +
    `> the canonical rubric lives at ${rubricRel}.\n\n---\n\n`;

  writeFileSync(out, header + readFileSync(rubricPath, "utf8"));

  return {
    ok: true,
    exitCode: 0,
    command: "scorecard",
    durationMs: 0,
    output: `Scorecard created: ${out}`,
    path: out,
  };
}
