# Task: Build "Voidbreaker" — a complete reimagining of the asteroid demo

You are given a 2010 C++ asteroid tech demo and its assets. The original is **not** a
finished game — it is a thin sample (ship, rocks, shooting, explosions). Your job is
**not** to modernize or faithfully recreate it. Your job is to ship **Voidbreaker**: a
**complete, addictive modern arcade game** that uses the original as a springboard.

## What you're given

Under `source/` (read-only reference input):

- `source/Game_Engine/` — the old 2D engine + a reference asteroids demo
  (`game.h`, `Engine/`, `Resources/`).
- `source/Asteroid_Demo/` — the packaged desktop demo (same gameplay DNA, same assets).

Useful DNA in the original (study it, then leave it behind):

- Ship that rotates / aims and fires plasma
- Asteroids that drift in and can be destroyed
- Explosions, fire SFX, boom SFX, background music, space backdrops
- Sprite atlas / TGA textures under `Resources/`

You may convert, crop, recolor, or reinterpret those assets. You may also author new
art/audio when the original set is not enough — but the game should still feel like it
grew out of this asteroid demo’s visual/audio identity.

## The game you must invent

**Voidbreaker** should feel like a finished arcade product someone would replay. At
minimum it needs a coherent fantasy and a loop that creates “one more run” pressure.

Required pillars (design them; don’t just checklist them):

1. **Core verb that sings.** Movement + shooting must feel sharp. Inertia, aiming,
   and destruction feedback should be satisfying on their own before any meta systems.
2. **Escalating threat.** Waves, denser fields, faster rocks, splitters, seekers,
   mines, or other enemy/hazard types — difficulty must climb in a readable way.
3. **Risk / reward.** Something that tempts greedy play: scrap in the debris field,
   multipliers that reset on hit, overheating weapons, void rifts that pay out if you
   stay close, etc. Safe play should be possible; greedy play should be more fun.
4. **Progression inside a run.** Power-ups, weapon mods, ship modules, or level-ups
   that change how you play mid-run — not just a bigger number on the HUD.
5. **A reason to come back.** High-score chase, unlockable loadouts between runs,
   daily seed, achievements, or a short unlock tree. Pick a meta that fits; ship it.
6. **Complete product shell.** Title / start flow, HUD, pause, game-over with run
   summary, audio (music + SFX), and readable instructions. No “tech demo” ending.
7. **Juice.** Screen shake, hit-stop or flash, particles, combo popups, or similar —
   enough feedback that destroying things feels good.

You are free to choose the exact fantasy (classic asteroids arena, twin-stick void
arena, gravity wells, boss asteroids, etc.) as long as the result is recognizably
descended from “ship vs asteroids in space” and is **more complete and more addictive**
than the original sample.

## Technical requirements

1. **Modern web stack.** Build a current, maintainable JS/TS project (e.g. Vite +
   Canvas / WebGL / Phaser / Pixi — your choice). Readable source modules — not a
   minified blob and not a C++ port of the old engine.
2. **Runs in modern browsers** and builds to a **static, deployable site**.
3. **Reuse or reinterpret original assets** from `source/**/Resources/` where they
   help. Convert TGA/WAV as needed. Document what you reused vs authored.
4. **Self-contained and documented.** README covering how to run it, the stack, the
   game design (loop, systems, why it should be addictive), and asset provenance.

## Deliverable contract (so the harness can check it)

Write your solution into `solutions/voidbreaker/` as a modern JS/TS project with:

- `solutions/voidbreaker/package.json` containing:
  - a **`build`** script that emits a static site (into `dist/`, `build/`, `out/`, or
    `public/`, with an `index.html`),
  - a **`preview`** (or `start`/`dev`) script that serves it locally.
- real source modules for the game,
- the assets it needs,
- `solutions/voidbreaker/README.md`.

The automated check (`bench verify voidbreaker`) installs deps, runs `build`, and
confirms a servable static site. Passing that gate is necessary but not sufficient —
**fun, completeness, and addictiveness are scored by hand** against `RUBRIC.md`.

## Out of scope

Faithful engine modernization, matching the 2010 demo beat-for-beat, multiplayer /
netcode, accounts, and backend services. Invent the game; don’t port the sample.
