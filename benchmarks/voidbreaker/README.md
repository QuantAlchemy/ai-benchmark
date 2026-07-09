# Benchmark: `voidbreaker`

> Reimagine the 2010 asteroid engine demo as a **complete, addictive modern arcade
> game** — not a faithful recreation. The original is a thin tech sample; the model
> must invent the systems that turn “ship shoots rocks” into something players chase
> for one more run.

## Why this is a good benchmark

The existing [`asteroid-engine`](../asteroid-engine/) benchmark tests build-system
modernization and fidelity. This one tests **game design + product completeness**
under the same source material. The model gets a real ship, asteroids, plasma, and
SFX — then has to decide what the *game* is: waves, risk/reward, progression, juice,
and a loop that hooks. Graders can play it; “is this actually fun?” is the point.

## Source

Fetched by `bench setup voidbreaker`, pinned to the same commits as `asteroid-engine`:

- [`Game_Engine`](https://github.com/ralphsmith80/Game_Engine) — engine + reference demo.
- [`Asteroid_Demo`](https://github.com/ralphsmith80/Asteroid_Demo) — packaged desktop demo.

Lands in `source/`. Treat as **inspiration and asset pack**, not a port target.

## Run it

```bash
pnpm bench setup  voidbreaker
pnpm bench task   voidbreaker
# … model writes a modern game into solutions/voidbreaker/ …
pnpm bench verify voidbreaker
pnpm bench score  voidbreaker --model <name>
```

By default, `verify` uses `solutions/voidbreaker/`. Point elsewhere with
`--solution <path>`.

- **Task / prompt:** [`TASK.md`](TASK.md)
- **Scoring rubric:** [`RUBRIC.md`](RUBRIC.md)
- **Solution contract:** a modern JS/TS web project with `build` + `preview` that
  emits and serves a static site.

## Grading note

The automated check only proves it builds and serves. The real score comes from
**playing the game** and judging whether it feels like a finished, addictive arcade
title — not whether it matches the 2010 demo beat-for-beat.
