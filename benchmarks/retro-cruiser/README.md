# Benchmark: `retro-cruiser`

> Recreate a **Phaser 2.0.7** arcade shooter as a modern web game — from only the
> **minified deployed bundle** and the original assets, because the source is lost.

## Why this is a good benchmark

This is a reverse-engineering task with a verifiable target. The model can't read clean
source — it has to recover gameplay from a ~720KB minified blob (Phaser + game logic
concatenated) and from observing the live game, then rebuild it cleanly on a current
engine. There's a real, playable original to grade against, so "did it actually reproduce
the game?" is answerable by sitting the two side by side.

## Source

Fetched by `bench setup retro-cruiser` (sparse checkout, pinned commit) from
[`ralphsmith80/ralphunlimited`](https://github.com/ralphsmith80/ralphunlimited)
(`public/games/retro-cruiser`). Lands in `source/`:

- `index.html`, `index.min.js` (the game, minified, Phaser 2.0.7 inside), `phaser.map`,
  `css/`, and the full original `assets/` (images, multi-format audio, fonts).

**Live original (grading reference):** https://ralphunlimited.com/blog/retro-cruiser/

## Run it

```bash
pnpm bench setup  retro-cruiser            # fetch the deployed bundle → source/
pnpm bench task   retro-cruiser            # print the prompt to hand the model
# … model writes a modern project into solutions/retro-cruiser/ …
pnpm bench verify retro-cruiser            # gate: installs, builds, serves?
pnpm bench score  retro-cruiser --model <name>   # scorecard to fill in by hand
```

By default, `verify` uses `solutions/retro-cruiser/` from the repo root. Point it
at a solution elsewhere with `--solution <path>`.

- **Task / prompt:** [`TASK.md`](TASK.md)
- **Scoring rubric:** [`RUBRIC.md`](RUBRIC.md)
- **Solution contract:** a modern JS/TS project in `solutions/retro-cruiser/` with `build` + `preview`
  scripts that emit and serve a static site.

## Grading note

The automated check only proves it builds and serves. The real score comes from **playing
your build next to the live original** and walking the side-by-side checklist in the rubric.
