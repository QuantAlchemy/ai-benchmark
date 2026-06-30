# ai-benchmark

A small, deliberately *fun* suite of benchmarks for evaluating AI coding models on
**real-world game-code modernization tasks**. Each benchmark hands the model an old
codebase and a goal, then you check whether the result builds, runs, and is any good.

This repo is a **harness**, not a set of solutions. It gives you, for each benchmark:

- the **original source** (fetched, pinned to an exact commit — same input every run),
- a **task prompt** (`TASK.md`) to hand the model under test,
- a **smoke test** (`bench verify`) that checks the candidate builds/runs,
- a **scoring rubric** (`RUBRIC.md`) you fill in by hand.

## The benchmarks

| id | what the model has to do | flavor |
|----|--------------------------|--------|
| [`asteroid-engine`](benchmarks/asteroid-engine/) | Modernize a 2010 C++/OpenGL/OpenAL 2D engine + asteroid demo so it builds & runs on a current machine with **one command and zero manual dependency installs**. | C++ · native · build systems |
| [`retro-cruiser`](benchmarks/retro-cruiser/) | Recreate a Phaser 2.0.7 arcade shooter as a modern web game. The original source is lost — the model gets only the **minified deployed bundle** + assets to reverse-engineer behavior from. | JS · games · reverse engineering |

Each benchmark is fully self-contained in its own folder, so they run independently.

## Requirements

- **Node.js ≥ 20** and **pnpm** (to run the harness CLI).
- **git** (the harness fetches pinned original source).
- Per-benchmark build tools are documented in each benchmark's `README.md`; the
  whole point of `asteroid-engine` is that the *solution* should need nothing else.

## Quick start

```bash
pnpm install            # no runtime deps; sets up the `bench` CLI

pnpm bench list                       # see what's available
pnpm bench setup asteroid-engine      # fetch the pinned original source
pnpm bench task  asteroid-engine      # print the prompt to hand the model
# … the model writes its port into solutions/asteroid-engine/ …
pnpm bench verify asteroid-engine     # smoke-test: does it build & run?
pnpm bench score  asteroid-engine --model claude-opus-4-8   # create a scorecard to fill in
```

> `pnpm bench <cmd>` and `node bin/bench.mjs <cmd>` are equivalent.

## The evaluation loop

```
setup  →  task  →  (model writes solutions/<id>/)  →  verify  →  score
```

1. **`setup`** materializes the original code under `benchmarks/<id>/source/`.
2. **`task`** prints `TASK.md` — copy it verbatim to the model so every run is identical.
3. The model writes its solution into `solutions/<id>/` (or anywhere; point `verify`
   at it with `--solution <path>`). Passing `--solution solutions` is treated as the
   aggregate root and resolves to `solutions/<id>/`.
4. **`verify`** runs the benchmark's build/run smoke check — an objective pass/fail gate.
   It is *not* the final grade; it just confirms the thing works.
5. **`score`** copies the rubric into `benchmarks/<id>/results/` as a dated scorecard you
   fill in by hand. That subjective score is the real result.

The repo keeps benchmark inputs, candidate outputs, and scorecards visible so historical
runs can be reviewed side by side as new models are tested. Large dependency folders and
build caches remain ignored.

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

For now, keep run history as plain files in git:

- candidate implementations under `solutions/<benchmark-id>/`,
- scorecards under `benchmarks/<benchmark-id>/results/`,
- benchmark source snapshots under `benchmarks/<benchmark-id>/source/` after setup.

A `runs.json` index can be added on top of these files as the comparison workflow firms up;
it should summarize runs rather than replace the reviewable artifacts.
