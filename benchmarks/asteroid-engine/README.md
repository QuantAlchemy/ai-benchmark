# Benchmark: `asteroid-engine`

> Modernize a 2010 C++/OpenGL/OpenAL 2D game engine + asteroid demo so it builds and runs
> on a current machine with **one command** and **zero manual dependency installs**.

## Why this is a good benchmark

It's a realistic "old native codebase" task. The engine is small but the work is fiddly in
the ways that matter: deprecated OpenGL, GLUT/OpenAL that nobody installs by hand anymore,
a hand-written Makefile, and a 32-bit-era mindset. The grader's machine deliberately does
**not** have OpenGL/GLUT/OpenAL pre-installed, so the model can't lean on "just run
`apt install`." It has to make the build self-sufficient. That's the historical pain point
this whole exercise is about.

## Source

Fetched by `bench setup asteroid-engine`, pinned to exact commits:

- [`Game_Engine`](https://github.com/ralphsmith80/Game_Engine) — the engine + reference demo.
- [`Asteroid_Demo`](https://github.com/ralphsmith80/Asteroid_Demo) — the packaged desktop + iPhone demo.

Lands in `source/`. Build artifacts are stripped; `Resources/` assets are kept.

## Run it

```bash
pnpm bench setup  asteroid-engine          # fetch pinned source → source/
pnpm bench task   asteroid-engine          # print the prompt to hand the model
# … model writes its port into solutions/asteroid-engine/ …
pnpm bench verify asteroid-engine          # build gate: does ./build.sh work with no deps?
pnpm bench score  asteroid-engine --model <name>   # scorecard to fill in by hand
```

By default, `verify` uses `solutions/asteroid-engine/` from the repo root. Point it
at a solution elsewhere with `--solution <path>`.

- **Task / prompt:** [`TASK.md`](TASK.md)
- **Scoring rubric:** [`RUBRIC.md`](RUBRIC.md)
- **Solution contract:** `solutions/asteroid-engine/build.sh` (one command, fetches its own native deps) +
  `solutions/asteroid-engine/run.sh` + `solutions/asteroid-engine/README.md`.

## Grader environment note

For criterion #1 to mean anything, run `verify` on a machine (or container) **without**
OpenGL/GLUT/OpenAL installed. A clean Linux container is ideal — if the model's `build.sh`
succeeds there, it genuinely solved the dependency problem.
