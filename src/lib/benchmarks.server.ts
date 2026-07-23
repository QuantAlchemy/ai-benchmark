import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  rmSync,
  rmdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listAgents, runAgentOnBenchmark } from "../../lib/agents.mjs";
import {
  createBenchmarkRun,
  deleteBenchmarkRun,
  listBenchmarkRuns,
  updateBenchmarkRun,
  updateBenchmarkRunMetrics,
} from "./run-history.server";
import type { BenchmarkRun } from "./db/schema";
import { emptyRunMetrics, type RunMetrics, type SolutionSizeMetrics } from "./metrics";
import { ensurePackageDependencies } from "./package-dependencies.server";
import { createScorecardData, renderScorecardMarkdown, type ScorecardData } from "./scorecard";
import { ensureRunSolution, startSyncWorker } from "./sync/sync-runtime.server";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BENCHMARKS_DIR = join(ROOT, "benchmarks");
const SOLUTIONS_DIR = join(ROOT, "solutions");
const REQUIRED_FIELDS = ["id", "name", "summary"] as const;
const DEFAULT_SCORECARD_MODEL = "rubric-v1";

startSyncWorker();

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
    launch?: string;
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
  solutionPath?: string;
  model?: string;
  requestedModel?: string;
  url?: string;
  run?: BenchmarkRun;
};

export type ActiveLaunch = {
  pid: number;
  url: string | null;
  command: string;
  startedAt: string;
};

export type BenchmarkSolutionEntry = {
  key: string;
  benchmarkId: string;
  benchmarkName: string;
  label: string;
  folderName: string;
  solutionPath: string;
  createdAt: string;
  updatedAt: string;
  empty: boolean;
  source: "solution";
  launch: ActiveLaunch | null;
  run?: BenchmarkRun;
  runs: BenchmarkRun[];
};

export type BenchmarkAgent = ReturnType<typeof listAgents>[number];
export type { BenchmarkRun };

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

export async function runBenchmarkScript(
  id: string,
  scriptKey: "setup" | "verify",
  solution?: string,
  runId?: number,
): Promise<CommandResult> {
  const benchmark = getManifest(id);
  const rel = benchmark.scripts?.[scriptKey];
  if (!rel) throw new Error(`Benchmark "${benchmark.id}" declares no "${scriptKey}" script.`);

  const scriptPath = join(benchmark.dir, rel);
  if (!existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`);

  let synchronizedSolution: string | undefined;
  if (runId) {
    try {
      synchronizedSolution = await ensureRunSolution(runId);
    } catch (error) {
      return {
        ok: false,
        exitCode: 2,
        command: `bash ${scriptPath}`,
        durationMs: 0,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const requestedSolution = synchronizedSolution ?? solution?.trim();
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
      const durationMs = Date.now() - startedAt;
      let run: BenchmarkRun | undefined;
      if (scriptKey === "verify" && runId) {
        run = updateBenchmarkRunMetrics(runId, {
          verify: {
            ok: exitCode === 0,
            exitCode,
            durationMs,
            measuredAt: new Date().toISOString(),
          },
          solutionSize: measureSolutionSize(solutionPath),
        });
      }
      resolvePromise({
        ok: exitCode === 0,
        exitCode,
        command: `bash ${scriptPath}`,
        durationMs,
        output: chunks.join("").trimEnd(),
        run,
      });
    });
  });
}

async function isPortAvailable(port: number) {
  return new Promise<boolean>((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.once("listening", () => {
      server.close(() => resolvePromise(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function chooseLaunchPort() {
  for (const port of [5173, 4173, 3000, 8080, 8000, 4321]) {
    if (await isPortAvailable(port)) return port;
  }
  for (let offset = 0; offset < 100; offset += 1) {
    const port = 5200 + offset;
    if (await isPortAvailable(port)) return port;
  }
  return 5173;
}

function resolveBenchmarkSolution(benchmark: Pick<BenchmarkManifest, "id">, solution?: string) {
  const requestedSolution = solution?.trim();
  const defaultSolution = defaultSolutionPath(benchmark);
  const requestedPath = requestedSolution ? resolve(requestedSolution) : "";
  return requestedPath === resolve(SOLUTIONS_DIR) ? resolve(defaultSolution) : resolve(requestedSolution || defaultSolution);
}

function detectPackageManager(solutionPath: string) {
  if (existsSync(join(solutionPath, "package-lock.json"))) return "npm";
  if (existsSync(join(solutionPath, "yarn.lock"))) return "yarn";
  return "pnpm";
}

function readPackageJson(solutionPath: string) {
  const packagePath = join(solutionPath, "package.json");
  if (!existsSync(packagePath)) return null;
  return JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

function hasLaunchEntrypoint(solutionPath: string) {
  return existsSync(join(solutionPath, "package.json")) || existsSync(join(solutionPath, "run.sh"));
}

function resolveLaunchSolutionPath(solutionPath: string) {
  if (!existsSync(solutionPath) || hasLaunchEntrypoint(solutionPath)) return solutionPath;
  const launchableChildren = readdirSync(solutionPath)
    .map((name) => join(solutionPath, name))
    .filter((path) => statSync(path).isDirectory() && hasLaunchEntrypoint(path))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return launchableChildren[0] ?? solutionPath;
}

function isViteProject(pkg: NonNullable<ReturnType<typeof readPackageJson>>, script: string) {
  return (
    /\bvite\b/.test(script) ||
    Boolean(pkg.dependencies?.vite) ||
    Boolean(pkg.devDependencies?.vite)
  );
}

function renderCommand(command: string, args: string[]) {
  return [command, ...args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))].join(" ");
}

async function probeUrl(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function wait(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

const SKIPPED_SOLUTION_DIRS = new Set(["node_modules", ".git"]);
const BUILD_OUTPUT_DIRS = new Set(["dist", "build", "out", ".output", ".next", "target"]);
const TEXT_FILE_EXTENSIONS = new Set([
  "c", "cc", "cpp", "h", "hpp", "m", "mm", "rs", "go", "java", "kt", "swift",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte",
  "py", "rb", "php", "sh", "bash", "zsh", "ps1", "cmake", "make", "mk",
  "html", "htm", "css", "scss", "less", "json", "yaml", "yml", "toml", "ini",
  "md", "txt", "xml", "svg", "sql", "glsl", "vert", "frag",
]);
const MAX_MEASURED_FILES = 20_000;
const MAX_LINE_COUNT_BYTES = 2 * 1024 * 1024;

function measureSolutionSize(solutionPath: string, includeBuildOutput = false): SolutionSizeMetrics | null {
  if (!existsSync(solutionPath) || !statSync(solutionPath).isDirectory()) return null;

  let files = 0;
  let bytes = 0;
  let lines = 0;
  const stack = [solutionPath];
  while (stack.length && files < MAX_MEASURED_FILES) {
    const dir = stack.pop()!;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (SKIPPED_SOLUTION_DIRS.has(name)) continue;
      if (!includeBuildOutput && BUILD_OUTPUT_DIRS.has(name)) continue;
      const path = join(dir, name);
      let stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        stack.push(path);
        continue;
      }
      if (!stats.isFile()) continue;
      files += 1;
      bytes += stats.size;
      const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
      if (TEXT_FILE_EXTENSIONS.has(extension) && stats.size <= MAX_LINE_COUNT_BYTES) {
        try {
          lines += readFileSync(path, "utf8").split("\n").length;
        } catch {
          // unreadable file; size still counted
        }
      }
      if (files >= MAX_MEASURED_FILES) break;
    }
  }

  // A solution that is only build output (e.g. a committed dist/) would otherwise measure as 0 files.
  if (files === 0 && !includeBuildOutput) return measureSolutionSize(solutionPath, true);
  return { files, bytes, lines, measuredAt: new Date().toISOString() };
}

type LaunchRecord = {
  benchmarkId: string;
  solutionPath: string;
  pid: number;
  pidStartTime: string | null;
  command: string;
  url: string | null;
  logPath: string;
  startedAt: string;
};

const LAUNCH_STATE_PATH = join(ROOT, "data", "launch-state.json");

function readLaunchState(): Record<string, LaunchRecord> {
  if (!existsSync(LAUNCH_STATE_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(LAUNCH_STATE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, LaunchRecord>) : {};
  } catch {
    return {};
  }
}

function writeLaunchState(state: Record<string, LaunchRecord>) {
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(LAUNCH_STATE_PATH, JSON.stringify(state, null, 2));
}

// Kernel start time (field 22 of /proc/<pid>/stat). Unlike the command line it
// is fixed at fork, so it survives exec (pnpm -> node) and detects PID reuse.
function readProcStartTime(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const afterComm = stat.slice(stat.lastIndexOf(")") + 2);
    return afterComm.split(" ")[19] ?? null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * A launch record only counts as alive when the PID exists AND (where /proc is
 * available) its start time still matches the one recorded at spawn time.
 * This prevents ever signaling an unrelated process that reused the PID.
 */
function launchRecordIsAlive(record: LaunchRecord) {
  if (!isProcessAlive(record.pid)) return false;
  if (record.pidStartTime === null) return true;
  return readProcStartTime(record.pid) === record.pidStartTime;
}

function registerLaunch(record: LaunchRecord) {
  const state = readLaunchState();
  state[record.solutionPath] = record;
  writeLaunchState(state);
}

function unregisterLaunch(solutionPath: string) {
  const state = readLaunchState();
  if (solutionPath in state) {
    delete state[solutionPath];
    writeLaunchState(state);
  }
}

function getActiveLaunchRecord(solutionPath: string): LaunchRecord | null {
  const state = readLaunchState();
  const record = state[resolve(solutionPath)];
  if (!record) return null;
  if (!launchRecordIsAlive(record)) {
    unregisterLaunch(record.solutionPath);
    return null;
  }
  return record;
}

function toActiveLaunch(record: LaunchRecord): ActiveLaunch {
  return { pid: record.pid, url: record.url, command: record.command, startedAt: record.startedAt };
}

const LOCAL_URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/[^\s"'<>\])]*)?/i;

function findLocalUrlInLog(logPath: string): string | null {
  if (!existsSync(logPath)) return null;
  try {
    const match = readFileSync(logPath, "utf8").match(LOCAL_URL_PATTERN);
    if (!match) return null;
    return match[0].replace("0.0.0.0", "127.0.0.1");
  } catch {
    return null;
  }
}

export async function launchBenchmarkSolution(id: string, solution?: string, runId?: number): Promise<CommandResult> {
  const benchmark = getManifest(id);
  if (runId) {
    try {
      solution = await ensureRunSolution(runId);
    } catch (error) {
      return {
        ok: false,
        exitCode: 2,
        command: "launch",
        durationMs: 0,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }
  // requestedPath is the entry folder the UI tracks; the actual launch may run
  // from a launchable child inside it. The launch registry is keyed by requestedPath.
  const requestedPath = resolve(resolveBenchmarkSolution(benchmark, solution));
  const solutionPath = resolveLaunchSolutionPath(requestedPath);
  if (!existsSync(solutionPath)) {
    return {
      ok: false,
      exitCode: 2,
      command: "launch",
      durationMs: 0,
      output: `Solution path does not exist: ${solutionPath}`,
    };
  }

  const existing = getActiveLaunchRecord(requestedPath);
  if (existing) {
    return {
      ok: true,
      exitCode: 0,
      command: `${existing.command} (pid ${existing.pid})`,
      durationMs: 0,
      output: [
        `Already running since ${existing.startedAt} (pid ${existing.pid}).`,
        existing.url ? `URL: ${existing.url}` : "No URL detected for this launch.",
        "Use Stop to terminate it before launching again.",
      ].join("\n"),
      solutionPath,
      url: existing.url ?? undefined,
    };
  }

  const manifestLaunch = benchmark.scripts?.launch;
  const packageJson = readPackageJson(solutionPath);
  const runScriptPath = join(solutionPath, "run.sh");
  const port = await chooseLaunchPort();
  let command = "";
  let args: string[] = [];
  let cwd = solutionPath;
  const url = packageJson ? `http://127.0.0.1:${port}/` : "";
  const env = {
    ...process.env,
    BENCH_ID: benchmark.id,
    BENCH_DIR: benchmark.dir,
    BENCH_SOURCE: join(benchmark.dir, "source"),
    BENCH_SOLUTION: solutionPath,
    HOST: process.env.HOST ?? "127.0.0.1",
    PORT: String(port),
  };
  const startedAt = Date.now();
  let dependencyPreparationCommand: string | null = null;

  if (manifestLaunch) {
    const scriptPath = join(benchmark.dir, manifestLaunch);
    if (!existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`);
    command = "bash";
    args = [scriptPath];
    cwd = benchmark.dir;
  } else if (packageJson) {
    const scripts = packageJson.scripts ?? {};
    const scriptName = ["dev", "preview", "start", "serve"].find((name) => Boolean(scripts[name]));
    if (!scriptName) {
      return {
        ok: false,
        exitCode: 2,
        command: "launch",
        durationMs: Date.now() - startedAt,
        output: `No launch script found in ${join(solutionPath, "package.json")}.\nExpected one of: preview, start, serve, dev.`,
      };
    }
    try {
      const preparation = await ensurePackageDependencies(solutionPath);
      dependencyPreparationCommand = preparation.command;
    } catch (error) {
      return {
        ok: false,
        exitCode: 1,
        command: "prepare dependencies",
        durationMs: Date.now() - startedAt,
        output: error instanceof Error ? error.message : String(error),
        solutionPath,
      };
    }
    const packageManager = detectPackageManager(solutionPath);
    command = packageManager;
    args = ["run", scriptName];
    if (isViteProject(packageJson, scripts[scriptName])) {
      args.push("--", "--host", "127.0.0.1", "--port", String(port));
    }
  } else if (existsSync(runScriptPath)) {
    command = "bash";
    args = ["-lc", "./run.sh"];
  } else {
    return {
      ok: false,
      exitCode: 2,
      command: "launch",
      durationMs: 0,
      output: `No launchable solution entry point found at ${solutionPath}.\nExpected package.json with preview/start/serve/dev, or executable run.sh.`,
    };
  }

  const logsDir = join(ROOT, "data", "launch-logs");
  mkdirSync(logsDir, { recursive: true });
  const logPath = join(logsDir, `${benchmark.id}-${Date.now()}.log`);
  const outFd = openSync(logPath, "a");
  const errFd = openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", outFd, errFd],
  });
  closeSync(outFd);
  closeSync(errFd);
  child.unref();

  const pidStartTime = child.pid ? readProcStartTime(child.pid) : null;

  let exitCode: number | null = null;
  child.once("exit", (code) => {
    exitCode = code ?? 1;
  });

  let responded = false;
  let detectedUrl = "";
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await wait(500);
    // The log URL wins over the assumed one: dev servers move to a free port
    // (and print the address) when the requested port is taken.
    const candidates = [...new Set([findLocalUrlInLog(logPath), url].filter(Boolean))] as string[];
    for (const candidate of candidates) {
      if (await probeUrl(candidate)) {
        detectedUrl = candidate;
        responded = true;
        break;
      }
    }
    if (responded || exitCode !== null) break;
  }
  if (!detectedUrl) detectedUrl = findLocalUrlInLog(logPath) ?? url;

  const log = existsSync(logPath) ? readFileSync(logPath, "utf8").trimEnd() : "";
  const displayCommand = renderCommand(command, args);
  if (exitCode !== null) {
    return {
      ok: false,
      exitCode,
      command: displayCommand,
      durationMs: Date.now() - startedAt,
      output: [
        dependencyPreparationCommand ? `Prepared dependencies with: ${dependencyPreparationCommand}` : "",
        `Launch command exited early with code ${exitCode}.`,
        `Log: ${logPath}`,
        log,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  if (child.pid) {
    registerLaunch({
      benchmarkId: benchmark.id,
      solutionPath: requestedPath,
      pid: child.pid,
      pidStartTime,
      command: displayCommand,
      url: detectedUrl || null,
      logPath,
      startedAt: new Date(startedAt).toISOString(),
    });
  }

  let run: BenchmarkRun | undefined;
  if (runId) {
    run = updateBenchmarkRunMetrics(runId, {
      launch: {
        ok: responded,
        url: detectedUrl || null,
        timeToReadyMs: responded ? Date.now() - startedAt : null,
        measuredAt: new Date().toISOString(),
      },
    });
  }

  return {
    ok: true,
    exitCode: 0,
    command: `${displayCommand} (pid ${child.pid})`,
    durationMs: Date.now() - startedAt,
    output: [
      dependencyPreparationCommand ? `Prepared dependencies with: ${dependencyPreparationCommand}` : "",
      `Started solution from: ${solutionPath}`,
      detectedUrl ? (responded ? `URL: ${detectedUrl}` : `URL candidate: ${detectedUrl} (no HTTP response confirmed yet)`) : "",
      `PID: ${child.pid}`,
      `Log: ${logPath}`,
      log ? `\nRecent output:\n${log}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    solutionPath,
    url: detectedUrl || undefined,
    run,
  };
}

export async function stopBenchmarkSolution(id: string, solution: string): Promise<CommandResult> {
  getManifest(id);
  const solutionPath = resolve(solution);
  const startedAt = Date.now();
  const state = readLaunchState();
  const record = state[solutionPath];
  if (!record) {
    return {
      ok: false,
      exitCode: 2,
      command: "stop",
      durationMs: 0,
      output: `No tracked launch for:\n${solutionPath}\n\nOnly processes started from this dashboard can be stopped here.`,
    };
  }
  if (!launchRecordIsAlive(record)) {
    unregisterLaunch(solutionPath);
    return {
      ok: true,
      exitCode: 0,
      command: `stop (pid ${record.pid})`,
      durationMs: Date.now() - startedAt,
      output: `Process ${record.pid} is no longer running (or the PID now belongs to another process). Cleared the launch record without sending any signal.`,
    };
  }

  // The launch was spawned detached, so the PID is its process-group leader;
  // signaling -pid takes down the whole tree (package manager + dev server).
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-record.pid, signal);
    } catch {
      try {
        process.kill(record.pid, signal);
      } catch {
        // already gone
      }
    }
  };

  signalGroup("SIGTERM");
  for (let attempt = 0; attempt < 10 && launchRecordIsAlive(record); attempt += 1) {
    await wait(200);
  }
  const forced = launchRecordIsAlive(record);
  if (forced) {
    signalGroup("SIGKILL");
    await wait(200);
  }
  unregisterLaunch(solutionPath);

  return {
    ok: true,
    exitCode: 0,
    command: `stop (pid ${record.pid})`,
    durationMs: Date.now() - startedAt,
    output: [
      `Stopped ${record.command} (pid ${record.pid})${forced ? " with SIGKILL after SIGTERM timed out" : ""}.`,
      record.url ? `Was serving: ${record.url}` : "",
      `Log: ${record.logPath}`,
    ]
      .filter(Boolean)
      .join("\n"),
    solutionPath,
  };
}

export async function runBenchmarkAgent(
  id: string,
  agent: string,
  model?: string,
  reasoningEffort?: string,
  serviceTier?: string,
  solution?: string,
  fastMode?: boolean,
): Promise<CommandResult> {
  const benchmark = getManifest(id);
  const result = await runAgentOnBenchmark(benchmark, {
    agent,
    model,
    reasoningEffort,
    serviceTier,
    solution,
    fastMode,
    versionSolution: true,
  });
  if (!result.ok) return result;

  const run = createScorecardRun(benchmark, DEFAULT_SCORECARD_MODEL, {
    agent,
    agentModel: result.model || model,
    reasoningEffort,
    serviceTier,
    runDurationMs: result.durationMs,
    solution: result.solutionPath ?? solution,
  });
  return {
    ...result,
    output: `${result.output}\n\nScorecard form created: ${run.scorecardPath ?? `run #${run.id}`}`.trim(),
    run,
  };
}

export function getBenchmarkRuns(id: string): BenchmarkRun[] {
  const benchmark = getManifest(id);
  return listBenchmarkRuns(benchmark.id);
}

export function getAllBenchmarkRuns(): BenchmarkRun[] {
  return listBenchmarkRuns();
}

function isDirectoryEmpty(path: string): boolean {
  if (!existsSync(path) || !statSync(path).isDirectory()) return false;
  return readdirSync(path).length === 0;
}

function upsertSolutionEntry(
  entries: Map<string, BenchmarkSolutionEntry>,
  benchmark: BenchmarkManifest,
  solutionPath: string,
  run?: BenchmarkRun,
) {
  const resolved = resolve(solutionPath);
  const stats = existsSync(resolved) ? statSync(resolved) : null;
  const folderName = resolved.split("/").pop() || benchmark.id;
  const existing = entries.get(resolved);
  if (existing) {
    if (run) {
      existing.runs.push(run);
      if (!existing.run || run.createdAt.localeCompare(existing.run.createdAt) > 0) existing.run = run;
    }
    existing.updatedAt = stats?.mtime.toISOString() ?? run?.updatedAt ?? existing.updatedAt;
    existing.empty = stats?.isDirectory() ? isDirectoryEmpty(resolved) : existing.empty;
    return;
  }
  const activeLaunch = getActiveLaunchRecord(resolved);
  entries.set(resolved, {
    key: `solution:${benchmark.id}:${resolved}`,
    benchmarkId: benchmark.id,
    benchmarkName: benchmark.name,
    label: stats ? stats.birthtime.toISOString() : (run?.createdAt ?? new Date(0).toISOString()),
    folderName,
    solutionPath: resolved,
    createdAt: stats ? stats.birthtime.toISOString() : (run?.createdAt ?? new Date(0).toISOString()),
    updatedAt: stats?.mtime.toISOString() ?? run?.updatedAt ?? run?.createdAt ?? new Date(0).toISOString(),
    empty: stats?.isDirectory() ? isDirectoryEmpty(resolved) : false,
    source: "solution",
    launch: activeLaunch ? toActiveLaunch(activeLaunch) : null,
    run,
    runs: run ? [run] : [],
  });
}

function getSolutionEntries(benchmarks: BenchmarkManifest[]): BenchmarkSolutionEntry[] {
  const entries = new Map<string, BenchmarkSolutionEntry>();

  for (const benchmark of benchmarks) {
    for (const run of listBenchmarkRuns(benchmark.id)) {
      upsertSolutionEntry(entries, benchmark, run.solutionPath, run);
    }

    const solutionRoot = defaultSolutionPath(benchmark);
    if (existsSync(solutionRoot)) {
      for (const name of readdirSync(solutionRoot)) {
        const path = join(solutionRoot, name);
        const stats = statSync(path);
        if (!stats.isDirectory()) continue;
        upsertSolutionEntry(entries, benchmark, path);
      }
    }
  }

  return [...entries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBenchmarkSolutionEntries(id: string): BenchmarkSolutionEntry[] {
  return getSolutionEntries([getManifest(id)]);
}

export function getAllSolutionEntries(): BenchmarkSolutionEntry[] {
  return getSolutionEntries(listManifests());
}

export function removeSolutionEntry(input: { id: string; key: string; solutionPath: string }): CommandResult {
  const benchmark = getManifest(input.id);
  const startedAt = Date.now();
  const solutionRoot = resolve(defaultSolutionPath(benchmark));
  const solutionPath = resolve(input.solutionPath);
  if (solutionPath !== solutionRoot && !solutionPath.startsWith(`${solutionRoot}/`)) {
    return {
      ok: false,
      exitCode: 2,
      command: "remove solution entry",
      durationMs: Date.now() - startedAt,
      output: `Refusing to remove path outside ${solutionRoot}: ${solutionPath}`,
    };
  }

  const entry = getBenchmarkSolutionEntries(benchmark.id).find((solution) => solution.key === input.key);
  if (entry?.run) {
    const runId = entry.run.id;
    const removed = removeBenchmarkRun(runId);
    return {
      ok: true,
      exitCode: 0,
      command: `remove run record ${runId}`,
      durationMs: Date.now() - startedAt,
      output: `Removed run record #${runId} and generated scorecard markdown if present.\nSolution folder left on disk: ${removed.solutionPath}`,
      solutionPath: removed.solutionPath,
    };
  }

  if (!existsSync(solutionPath)) {
    return {
      ok: true,
      exitCode: 0,
      command: `remove empty folder ${solutionPath}`,
      durationMs: Date.now() - startedAt,
      output: `Folder already removed: ${solutionPath}`,
    };
  }
  if (!statSync(solutionPath).isDirectory()) {
    return {
      ok: false,
      exitCode: 2,
      command: `remove empty folder ${solutionPath}`,
      durationMs: Date.now() - startedAt,
      output: `Not a directory: ${solutionPath}`,
    };
  }
  if (!isDirectoryEmpty(solutionPath)) {
    return {
      ok: false,
      exitCode: 2,
      command: `remove empty folder ${solutionPath}`,
      durationMs: Date.now() - startedAt,
      output: `Folder is not empty, so it was not removed: ${solutionPath}`,
    };
  }
  rmdirSync(solutionPath);
  return {
    ok: true,
    exitCode: 0,
    command: `remove empty folder ${solutionPath}`,
    durationMs: Date.now() - startedAt,
    output: `Removed empty solution folder:\n${solutionPath}`,
  };
}

export function saveBenchmarkRun(data: {
  id: number;
  scoreModel: string;
  scorecardData: ScorecardData;
  notes: string;
}): BenchmarkRun {
  const updated = updateBenchmarkRun(data);
  if (updated.scorecardPath) {
    writeFileSync(
      updated.scorecardPath,
      renderScorecardMarkdown({
        benchmarkName: updated.benchmarkName,
        benchmarkId: updated.benchmarkId,
        scoreModel: updated.scoreModel,
        createdAt: updated.createdAt,
        data: updated.scorecardData,
        metrics: updated.metrics,
        notes: updated.notes,
      }),
    );
  }
  return updated;
}

export function removeBenchmarkRun(id: number): BenchmarkRun {
  const deleted = deleteBenchmarkRun(id);
  if (deleted.scorecardPath && existsSync(deleted.scorecardPath)) {
    rmSync(deleted.scorecardPath);
  }
  return deleted;
}

export function createScorecard(
  id: string,
  modelName: string,
  force: boolean,
  options: {
    agent?: string;
    agentModel?: string;
    reasoningEffort?: string;
    serviceTier?: string;
    runDurationMs?: number | null;
    solution?: string;
    notes?: string;
  } = {},
): CommandResult & { path?: string; run?: BenchmarkRun } {
  const benchmark = getManifest(id);
  const run = createScorecardRun(benchmark, modelName, options);
  return {
    ok: true,
    exitCode: 0,
    command: "scorecard",
    durationMs: 0,
    output: `Scorecard form created: ${run.scorecardPath}\nRun history saved in data/benchmark-history.sqlite (#${run.id}).`,
    path: run.scorecardPath ?? undefined,
    run,
  };
}

function createScorecardRun(
  benchmark: BenchmarkManifest,
  modelName: string,
  options: {
    agent?: string;
    agentModel?: string;
    reasoningEffort?: string;
    serviceTier?: string;
    runDurationMs?: number | null;
    solution?: string;
    notes?: string;
  } = {},
) {
  const rubricRel = benchmark.files?.rubric ?? "RUBRIC.md";
  const rubricPath = join(benchmark.dir, rubricRel);
  if (!existsSync(rubricPath)) throw new Error(`No rubric at ${rubricPath}`);

  const model = modelName.trim() || "candidate";
  const rubric = readFileSync(rubricPath, "utf8");
  const scorecardData = createScorecardData(rubric);
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  const resultsDir = join(benchmark.dir, "results");
  mkdirSync(resultsDir, { recursive: true });

  const safeModel = model.replace(/[^a-z0-9._-]+/gi, "-");
  const out = join(resultsDir, `${stamp}__${safeModel}.md`);
  const requestedSolution = options.solution?.trim();
  const defaultSolution = defaultSolutionPath(benchmark);
  const requestedPath = requestedSolution ? resolve(requestedSolution) : "";
  const solutionPath = requestedPath === resolve(SOLUTIONS_DIR) ? resolve(defaultSolution) : resolve(requestedSolution || defaultSolution);
  const metrics: RunMetrics = {
    ...emptyRunMetrics(),
    agentDurationMs: options.runDurationMs ?? null,
    solutionSize: measureSolutionSize(solutionPath),
  };
  const run = createBenchmarkRun({
    benchmarkId: benchmark.id,
    benchmarkName: benchmark.name,
    agentId: options.agent || null,
    agentModel: options.agentModel || null,
    reasoningEffort: options.reasoningEffort || null,
    serviceTier: options.serviceTier || null,
    runDurationMs: options.runDurationMs ?? null,
    solutionPath,
    scoreModel: model,
    scorecardPath: out,
    scorecardContent: rubric,
    scorecardData,
    metrics,
    notes: options.notes ?? "",
  });
  writeFileSync(
    out,
    renderScorecardMarkdown({
      benchmarkName: benchmark.name,
      benchmarkId: benchmark.id,
      scoreModel: model,
      createdAt,
      data: scorecardData,
      metrics,
      notes: options.notes ?? "",
    }),
  );

  return run;
}
