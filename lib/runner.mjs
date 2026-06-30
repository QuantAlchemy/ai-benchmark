// Runs a benchmark's lifecycle scripts (setup, verify) as child processes.
// Scripts are plain shell so each benchmark stays self-contained and language-agnostic.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultSolutionPath } from "./paths.mjs";

/**
 * Run one of a benchmark's declared scripts (e.g. "setup", "verify").
 * Resolves with the child's exit code; rejects only on spawn failure.
 *
 * Environment passed to the script:
 *   BENCH_ID        – the benchmark id
 *   BENCH_DIR       – absolute path to the benchmark folder
 *   BENCH_SOURCE    – absolute path to <benchmark>/source (original code)
 *   BENCH_SOLUTION  – absolute path to the candidate solution being evaluated
 */
export function runScript(bench, scriptKey, { solution, extraArgs = [] } = {}) {
  const rel = bench.scripts?.[scriptKey];
  if (!rel) {
    return Promise.reject(new Error(`Benchmark "${bench.id}" declares no "${scriptKey}" script.`));
  }

  const scriptPath = join(bench.dir, rel);
  if (!existsSync(scriptPath)) {
    return Promise.reject(new Error(`Script not found: ${scriptPath}`));
  }

  const solutionPath = resolve(solution ?? defaultSolutionPath(bench));

  const env = {
    ...process.env,
    BENCH_ID: bench.id,
    BENCH_DIR: bench.dir,
    BENCH_SOURCE: join(bench.dir, "source"),
    BENCH_SOLUTION: solutionPath,
  };

  return new Promise((resolvePromise, reject) => {
    const child = spawn("bash", [scriptPath, ...extraArgs], {
      cwd: bench.dir,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise(code ?? 1));
  });
}
