# ai-benchmark

A small, deliberately *fun* suite of benchmarks for evaluating AI coding models on
**real-world game-code modernization tasks**. Each benchmark hands the model an old
codebase and a goal, then you check whether the result builds, runs, and is any good.

This repo is a **harness**, not a set of solutions. It gives you, for each benchmark:

- the **original source** (fetched, pinned to an exact commit — same input every run),
- a **task prompt** (`TASK.md`) to hand the model under test,
- an **agent runner** (`bench run`) for installed coding-agent CLIs,
- a **smoke test** (`bench verify`) that checks the candidate builds/runs,
- a **scoring rubric** (`RUBRIC.md`) you fill in by hand.

## The benchmarks

| id | what the model has to do | flavor |
|----|--------------------------|--------|
| [`asteroid-engine`](benchmarks/asteroid-engine/) | Modernize a 2010 C++/OpenGL/OpenAL 2D engine + asteroid demo so it builds & runs on a current machine with **one command and zero manual dependency installs**. | C++ · native · build systems |
| [`retro-cruiser`](benchmarks/retro-cruiser/) | Recreate a Phaser 2.0.7 arcade shooter as a modern web game. The original source is lost — the model gets only the **minified deployed bundle** + assets to reverse-engineer behavior from. | JS · games · reverse engineering |
| [`voidbreaker`](benchmarks/voidbreaker/) | Reimagine the asteroid demo as a **complete, addictive modern arcade game** — not a faithful port. Same source DNA; invent the systems that make players chase one more run. | JS · games · game design |
| [`cruiser-reloaded`](benchmarks/cruiser-reloaded/) | Reimagine Retro Cruiser as a **complete, addictive modern arcade game** — not a fidelity rebuild. Use the minified original + assets as a springboard, then invent the finished product. | JS · games · game design |

Each benchmark is fully self-contained in its own folder, so they run independently.

## Requirements

- **Node.js ≥ 24** and **pnpm** (to run the harness CLI and local SQLite history).
- **git** (the harness fetches pinned original source).
- Optional coding agents for `bench run`: **Codex**, **Claude Code**, or
  **Cursor Agent** installed and authenticated on your machine.
- Per-benchmark build tools are documented in each benchmark's `README.md`; the
  whole point of `asteroid-engine` is that the *solution* should need nothing else.

## Quick start

```bash
pnpm install            # no runtime deps; sets up the `bench` CLI

pnpm bench list                       # see what's available
pnpm bench setup asteroid-engine      # fetch the pinned original source
pnpm bench agents                     # see which local agent CLIs are ready
pnpm bench run asteroid-engine --agent codex
pnpm bench verify asteroid-engine     # smoke-test: does it build & run?
pnpm bench score  asteroid-engine --model claude-opus-4-8   # create a scorecard to fill in
```

> `pnpm bench <cmd>` and `node bin/bench.mjs <cmd>` are equivalent.

## The evaluation loop

```
setup  →  run  →  verify  →  score
```

1. **`setup`** materializes the original code under `benchmarks/<id>/source/`.
2. **`run`** launches an installed local coding agent and gives it the benchmark task.
   Supported agent ids are `codex`, `claude`, and `cursor`; `agent` and
   `cursor-agent` are aliases for `cursor`.
3. The agent writes its solution into `solutions/<id>/` (or anywhere; point `verify`
   at it with `--solution <path>`). Passing `--solution solutions` is treated as the
   aggregate root and resolves to `solutions/<id>/`.
4. **`verify`** runs the benchmark's build/run smoke check — an objective pass/fail gate.
   It is *not* the final grade; it just confirms the thing works.
5. A successful dashboard **`run`** creates a persisted scorecard automatically. The CLI
   **`score`** command can still create a manual scorecard when needed.
   Scorecards are editable and deletable with their notes and generated markdown.

The repo keeps benchmark inputs, candidate outputs, and scorecards visible so historical
runs can be reviewed side by side as new models are tested. Large dependency folders and
build caches remain ignored.

You can still use **`task`** to print `TASK.md` for a manual model run.

## Agent runners

`bench run` uses the CLI tools you already have installed:

```bash
pnpm bench run retro-cruiser --agent codex
pnpm bench run retro-cruiser --agent claude --model opus
pnpm bench run retro-cruiser --agent cursor --model gpt-5
pnpm bench run retro-cruiser --agent codex --model gpt-5.5 --reasoning high --service-tier priority
```

The web dashboard exposes the same runner through the agent selector. The runner creates
the solution directory if needed, passes `BENCH_ID`, `BENCH_DIR`, `BENCH_SOURCE`, and
`BENCH_SOLUTION` to the child process, asks the agent to keep changes scoped to the
solution directory, and creates a scorecard only after the agent run succeeds.

The dashboard model picker uses agent-specific options. For Codex, it reads the installed
CLI's local model catalog, including each model's description, reasoning levels, and Fast
mode support, so newly available models appear without a benchmark code update. A static
list is used only when that catalog is unavailable. Codex, Claude, and Cursor expose
reasoning controls where their CLIs support them; Codex and Cursor also expose Fast mode.
Leaving the model on "CLI default" preserves the installed agent's default behavior while
recording the resolved model in run history and versioned solution folder names.

`openrouter` is reserved as a future model source. For now, `bench agents` will show it as
planned; API-backed runs need a coding-agent runtime with filesystem tools before they can
produce benchmark solutions directly.

## Adding a benchmark

There is no central registry; the CLI discovers any folder under `benchmarks/` that
contains a `benchmark.json`. To add one:

```
benchmarks/<your-id>/
├── benchmark.json        # manifest (see below)
├── README.md             # human overview
├── TASK.md               # the prompt handed to the model under test
├── RUBRIC.md             # manual scoring rubric / scorecard template
└── scripts/
    ├── setup.sh          # fetch/prepare original source into $BENCH_SOURCE
    └── verify.sh         # build/run smoke check against $BENCH_SOLUTION
```

Minimal `benchmark.json`:

```json
{
  "id": "your-id",
  "name": "Human-readable name",
  "summary": "One-line description.",
  "category": "optional tag",
  "difficulty": "easy | medium | hard",
  "source": {
    "repos": [
      { "name": "Repo", "url": "https://github.com/owner/repo", "commit": "<sha>" }
    ]
  },
  "scripts": { "setup": "scripts/setup.sh", "verify": "scripts/verify.sh" },
  "files": { "task": "TASK.md", "rubric": "RUBRIC.md" }
}
```

Scripts receive these environment variables:

| var | meaning |
|-----|---------|
| `BENCH_ID` | the benchmark id |
| `BENCH_DIR` | absolute path to the benchmark folder |
| `BENCH_SOURCE` | absolute path to `<benchmark>/source` (original code) |
| `BENCH_SOLUTION` | absolute path to the candidate solution being evaluated |

## Historical runs

Run history is stored as reviewable files plus local SQLite metadata:

- candidate implementations under `solutions/<benchmark-id>/<timestamp>__<agent>__<model>__reasoning-<level>__mode-<fast-or-standard>/`,
  so previous solutions are not edited in place,
- scorecard markdown files under `benchmarks/<benchmark-id>/results/`,
- local scorecard metadata, structured rubric scores, generated scorecard markdown, and notes in
  `data/benchmark-history.sqlite` (ignored by git to avoid binary merge conflicts),
- benchmark source snapshots under `benchmarks/<benchmark-id>/source/` after setup.

The dashboard treats a rubric as the template for a scorecard form. Each criterion is
persisted with a stable id, weight, score, weighted value, and notes, so comparisons can
group runs by criterion instead of scraping markdown tables.
