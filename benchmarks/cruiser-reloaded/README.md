# Benchmark: `cruiser-reloaded`

> Reimagine **Retro Cruiser** as a **complete, addictive modern arcade game** — not a
> faithful recreation. The model gets the minified original + assets as a springboard,
> then must invent the systems that turn a short side-scroller into a finished product
> players chase for one more run.

## Why this is a good benchmark

The existing [`retro-cruiser`](../retro-cruiser/) benchmark tests reverse-engineering
and fidelity. This one tests **game design + product completeness** under the same
source material. The model can study the original’s ship, fuel/health tension, rocks,
drones, weapon tiers, and boosts — then decide what the *game* becomes: missions,
combos, loadouts, bosses, meta progression. Graders play it; “is this actually fun?”
is the point.

## Source

Fetched by `bench setup cruiser-reloaded` (sparse checkout, pinned commit) from
[`ralphsmith80/ralphunlimited`](https://github.com/ralphsmith80/ralphunlimited)
(`public/games/retro-cruiser`). Lands in `source/`:

- `index.html`, `index.min.js` (minified Phaser 2.0.7 + game), `phaser.map`,
  `css/`, and the full original `assets/`.

**Live original (inspiration only):** https://ralphunlimited.com/blog/retro-cruiser/

Treat the original as **inspiration and asset pack**, not a fidelity target.

## Run it

```bash
pnpm bench setup  cruiser-reloaded
pnpm bench task   cruiser-reloaded
# … model writes a modern game into solutions/cruiser-reloaded/ …
pnpm bench verify cruiser-reloaded
pnpm bench score  cruiser-reloaded --model <name>
```

By default, `verify` uses `solutions/cruiser-reloaded/`. Point elsewhere with
`--solution <path>`.

- **Task / prompt:** [`TASK.md`](TASK.md)
- **Scoring rubric:** [`RUBRIC.md`](RUBRIC.md)
- **Solution contract:** a modern JS/TS project with `build` + `preview` that emits
  and serves a static site.

## Grading note

The automated check only proves it builds and serves. The real score comes from
**playing the game** and judging whether it feels like a finished, addictive arcade
title — not whether it matches the live original beat-for-beat.
