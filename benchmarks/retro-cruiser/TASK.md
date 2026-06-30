# Task: Rebuild "Retro Cruiser" as a modern web game

"Retro Cruiser" is an arcade shooter originally built with **Phaser 2.0.7** over a decade
ago. The original source code is **lost**. What survives is the deployed build: a single
**minified** JavaScript bundle (with Phaser baked in) plus the complete original asset set.
Your job is to **recreate the game as a modern, maintainable web project** that plays the
same.

## What you're given

Under `source/` (read-only reference input):

- `source/index.html` — the page that boots the original game.
- `source/index.min.js` — **the entire game, minified, ~720KB, with Phaser 2.0.7 bundled
  in.** This is your primary source of truth for behavior. Reverse-engineer the game logic
  from it (the `phaser.map` source map helps you separate engine code from game code).
- `source/css/` — page styling.
- `source/assets/` — all original art, audio (in several formats), and fonts. **Reuse these.**

You can also observe the live original for reference behavior:
**https://ralphunlimited.com/blog/retro-cruiser/**

## Requirements

1. **Recreate the gameplay faithfully.** Reproduce what the original does: player ship and
   controls, enemies/obstacles, weapons and shooting, pickups/boosts, collisions, scoring,
   stages/levels, win/lose states, title and game-over screens, sound effects and music.
   Match the feel as closely as the minified source and the live game let you.
2. **Modern stack.** Rebuild on a current, maintained version of Phaser (Phaser 3, or
   Phaser 4 if you prefer) with a modern build setup (e.g. Vite). Real, readable source
   modules — **not** a re-minified blob. TypeScript is welcome but optional.
3. **Reuse the original assets.** Pull art/audio/fonts from `source/assets/`. You may
   re-encode or repack them, but the game should look and sound like the original.
4. **Runs in modern browsers** and builds to a **static, deployable site**.
5. **Keep it self-contained and documented.** A README covering how to run it, the stack
   you chose, how you recovered the gameplay from the minified bundle, and anything you
   couldn't fully recover (call out guesses).

## Deliverable contract (so the harness can check it)

Write your solution into `solutions/retro-cruiser/` as a modern JS/TS project with:

- `solutions/retro-cruiser/package.json` containing:
  - a **`build`** script that emits a static site (into `dist/`, `build/`, `out/`, or
    `public/`, with an `index.html`),
  - a **`preview`** (or `start`/`dev`) script that serves it locally.
- real source modules for the game,
- the assets it needs (reused from `source/assets/`),
- `solutions/retro-cruiser/README.md`.

The automated check (`bench verify retro-cruiser`) installs deps, runs `build`, confirms a
servable static site is produced, and best-effort starts the server. Passing that gate is
necessary but not sufficient — **gameplay fidelity is scored by hand** against `RUBRIC.md`,
by actually playing your build next to the original.

## Out of scope

New levels or mechanics the original didn't have, multiplayer/netcode, backend services,
and accounts. Faithfully rebuild what existed; don't invent new scope.
