#!/usr/bin/env node
// ai-benchmark CLI — single entry point that dispatches to self-contained
// benchmark folders discovered under benchmarks/.
import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { listBenchmarks, getBenchmark } from "../lib/discover.mjs";
import { defaultSolutionPath, SOLUTIONS_DIR } from "../lib/paths.mjs";
import { runScript } from "../lib/runner.mjs";
import { bold, dim, cyan, green, yellow, heading, ok, warn, fail, info } from "../lib/ui.mjs";

const [, , command, ...rest] = process.argv;

// Minimal flag parser: pulls --key value / --flag out of positional args.
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

const { flags, positional } = parseArgs(rest);

function printFile(bench, key) {
  const rel = bench.files?.[key];
  if (!rel) return fail(`Benchmark "${bench.id}" declares no "${key}" file.`);
  const path = join(bench.dir, rel);
  if (!existsSync(path)) return fail(`File not found: ${path}`);
  process.stdout.write(readFileSync(path, "utf8"));
}

function requireId(name) {
  const id = positional[0];
  if (!id) {
    fail(`"${name}" needs a benchmark id. Try: bench list`);
    process.exit(2);
  }
  return getBenchmark(id);
}

function resolveSolution(bench) {
  if (!flags.solution) return defaultSolutionPath(bench);
  const candidate = resolve(String(flags.solution));
  return candidate === resolve(SOLUTIONS_DIR) ? defaultSolutionPath(bench) : candidate;
}

function ensureDefaultSolutionDir(bench) {
  if (flags.solution) return false;
  const solution = defaultSolutionPath(bench);
  if (!existsSync(solution)) {
    mkdirSync(solution, { recursive: true });
    warn(`Created default solution directory: ${solution}`);
    console.log(dim("Place the candidate files there, then re-run verify."));
    return true;
  }
  return false;
}

function isDefaultSolution(bench, solution) {
  return resolve(solution) === resolve(defaultSolutionPath(bench));
}

function isEmptyDir(path) {
  return existsSync(path) && readdirSync(path).length === 0;
}

const commands = {
  list() {
    const benches = listBenchmarks();
    if (!benches.length) return warn("No benchmarks found under benchmarks/.");
    heading("Available benchmarks");
    for (const b of benches) {
      const tags = [b.category, b.difficulty].filter(Boolean).join(" · ");
      console.log(`  ${bold(green(b.id))}${tags ? dim("  (" + tags + ")") : ""}`);
      console.log(`    ${b.summary}`);
    }
    console.log(dim("\nRun `bench info <id>` for details, `bench task <id>` for the prompt."));
  },

  info() {
    const b = requireId("info");
    heading(b.name);
    console.log(`${bold("id")}        ${b.id}`);
    if (b.category) console.log(`${bold("category")}  ${b.category}`);
    if (b.difficulty) console.log(`${bold("difficulty")} ${b.difficulty}`);
    console.log(`${bold("summary")}   ${b.summary}`);
    if (b.source?.repos?.length) {
      console.log(bold("\nsource:"));
      for (const r of b.source.repos) {
        console.log(`  • ${r.name} ${dim(r.url)}`);
        if (r.commit) console.log(`    pinned @ ${dim(r.commit)}`);
      }
    }
    const sourceDir = join(b.dir, "source");
    const solutionDir = defaultSolutionPath(b);
    console.log(
      `\n${bold("source fetched:")} ${existsSync(sourceDir) ? green("yes") : yellow("no — run `bench setup " + b.id + "`")}`
    );
    console.log(`${bold("solution:")}       ${existsSync(solutionDir) ? green(solutionDir) : yellow(solutionDir + " (not created yet)")}`);
    console.log(bold("\nfiles:"));
    console.log(`  task    ${join(b.dir, b.files?.task ?? "TASK.md")}`);
    console.log(`  rubric  ${join(b.dir, b.files?.rubric ?? "RUBRIC.md")}`);
    console.log(dim("\nNext: bench task " + b.id + "  →  hand TASK.md to the model under test."));
  },

  task() {
    printFile(requireId("task"), "task");
  },

  rubric() {
    printFile(requireId("rubric"), "rubric");
  },

  async setup() {
    const b = requireId("setup");
    heading(`Setting up: ${b.id}`);
    info("Fetching pinned original source into source/ …");
    const code = await runScript(b, "setup");
    if (code === 0) ok(`Source ready at ${join(b.dir, "source")}`);
    else fail(`Setup failed (exit ${code}).`);
    process.exit(code);
  },

  async verify() {
    const b = requireId("verify");
    const solution = resolveSolution(b);
    heading(`Verifying: ${b.id}`);
    info(`Solution: ${solution}`);
    if (!existsSync(solution) && ensureDefaultSolutionDir(b)) {
      process.exit(2);
    }
    if (!existsSync(solution)) {
      fail(`Solution path does not exist: ${solution}`);
      console.log(dim(`Pass one with --solution <path>, or place it at ${defaultSolutionPath(b)}.`));
      process.exit(2);
    }
    if (isDefaultSolution(b, solution) && isEmptyDir(solution)) {
      fail(`Default solution directory is empty: ${solution}`);
      console.log(dim("Place the candidate files there, then re-run verify."));
      process.exit(2);
    }
    const code = await runScript(b, "verify", { solution });
    console.log("");
    if (code === 0) ok("Smoke check passed — now score by hand: bench score " + b.id);
    else fail(`Smoke check failed (exit ${code}). See output above.`);
    process.exit(code);
  },

  score() {
    const b = requireId("score");
    const rubricRel = b.files?.rubric ?? "RUBRIC.md";
    const rubricPath = join(b.dir, rubricRel);
    if (!existsSync(rubricPath)) {
      fail(`No rubric at ${rubricPath}`);
      process.exit(2);
    }
    const model = flags.model ? String(flags.model) : "candidate";
    const stamp = new Date().toISOString().slice(0, 10);
    const resultsDir = join(b.dir, "results");
    mkdirSync(resultsDir, { recursive: true });
    const safeModel = model.replace(/[^a-z0-9._-]+/gi, "-");
    const out = join(resultsDir, `${stamp}__${safeModel}.md`);
    if (existsSync(out) && !flags.force) {
      warn(`Scorecard already exists: ${out}`);
      console.log(dim("Re-run with --force to overwrite, or just edit the existing file."));
      process.exit(1);
    }
    const header =
      `<!-- Scorecard generated by ai-benchmark -->\n` +
      `# Scorecard — ${b.name}\n\n` +
      `- **Model:** ${model}\n` +
      `- **Date:** ${stamp}\n` +
      `- **Benchmark:** ${b.id}\n\n` +
      `> Fill in the score columns below, then save. This is a copy of the rubric;\n` +
      `> the canonical rubric lives at ${rubricRel}.\n\n---\n\n`;
    writeFileSync(out, header + readFileSync(rubricPath, "utf8"));
    ok(`Scorecard created: ${out}`);
    console.log(dim("Open it, fill in the scores by hand, and keep it alongside the benchmark."));
  },

  help() {
    heading("ai-benchmark");
    console.log("A small suite of game-code modernization benchmarks for AI models.\n");
    console.log(bold("Usage:") + "  pnpm bench <command> [id] [flags]\n");
    console.log(bold("Commands:"));
    const rows = [
      ["list", "list all benchmarks"],
      ["info <id>", "show benchmark details and setup status"],
      ["task <id>", "print TASK.md — the prompt to hand the model under test"],
      ["setup <id>", "fetch the pinned original source into source/"],
      ["verify <id> [--solution <path>]", "smoke-test a candidate solution (defaults to solutions/<id>/)"],
      ["rubric <id>", "print the manual scoring rubric"],
      ["score <id> [--model <name>] [--force]", "create a scorecard you fill in by hand"],
      ["help", "show this help"],
    ];
    for (const [cmd, desc] of rows) console.log(`  ${green(cmd.padEnd(38))} ${desc}`);
    console.log(dim(`\nDefault solution root: ${SOLUTIONS_DIR}`));
    console.log(dim("\nTypical flow: setup → task → (model writes solution) → verify → score"));
  },
};

async function main() {
  const cmd = command && commands[command] ? command : command ? null : "help";
  if (cmd === null) {
    fail(`Unknown command: ${command}`);
    commands.help();
    process.exit(2);
  }
  try {
    await commands[cmd]();
  } catch (err) {
    fail(err.message);
    process.exit(1);
  }
}

main();
