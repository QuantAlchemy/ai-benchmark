import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BENCHMARKS_DIR = join(ROOT, "benchmarks");
export const SOLUTIONS_DIR = join(ROOT, "solutions");

export function defaultSolutionPath(benchmark) {
  const id = typeof benchmark === "string" ? benchmark : benchmark.id;
  return join(SOLUTIONS_DIR, id);
}
