// Discovers benchmarks by scanning the benchmarks/ directory for benchmark.json
// manifests. Adding a new benchmark is just dropping in a new folder — no central
// registry to edit.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { BENCHMARKS_DIR } from "./paths.mjs";

const REQUIRED_FIELDS = ["id", "name", "summary"];

function parseManifest(dir) {
  const manifestPath = join(dir, "benchmark.json");
  if (!existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(`Invalid JSON in ${manifestPath}: ${err.message}`);
  }

  const missing = REQUIRED_FIELDS.filter((f) => !manifest[f]);
  if (missing.length) {
    throw new Error(`${manifestPath} is missing required field(s): ${missing.join(", ")}`);
  }

  return { ...manifest, dir, manifestPath };
}

export function listBenchmarks() {
  if (!existsSync(BENCHMARKS_DIR)) return [];
  return readdirSync(BENCHMARKS_DIR)
    .map((name) => join(BENCHMARKS_DIR, name))
    .filter((p) => statSync(p).isDirectory())
    .map(parseManifest)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getBenchmark(id) {
  const found = listBenchmarks().find((b) => b.id === id);
  if (!found) {
    const ids = listBenchmarks().map((b) => b.id);
    const hint = ids.length ? ` Available: ${ids.join(", ")}` : "";
    throw new Error(`No benchmark with id "${id}".${hint}`);
  }
  return found;
}
