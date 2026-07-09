# Task: Build "Cruiser Reloaded" — a complete reimagining of Retro Cruiser

"Retro Cruiser" is an arcade side-scroller originally built with **Phaser 2.0.7**. The
original source is lost; what survives is the minified deployed bundle plus assets. Your
job is **not** to faithfully rebuild that game. Your job is to ship **Cruiser Reloaded**:
a **complete, addictive modern arcade game** that uses the original as a springboard.

## What you're given

Under `source/` (read-only reference input):

- `source/index.html` — the page that boots the original.
- `source/index.min.js` — the entire original game, minified, with Phaser 2.0.7 bundled
  in. Useful for recovering *ideas* (ship, fuel/health, rocks, drones, weapons, boosts,
  menus) — not as a fidelity checklist.
- `source/css/` — original page styling.
- `source/assets/` — art, audio, fonts. **Reuse these heavily.**

You can also observe the live original for inspiration:
**https://ralphunlimited.com/blog/retro-cruiser/**

Useful DNA in the original (study it, then leave fidelity behind):

- Side-scrolling ship with health **and** fuel tension
- Rocks / debris field, drones / enemies, mines
- Weak / medium / strong weapon tiers and pickups
- Health and fuel boosts
- Title / game-over flow, scoreboard, retro pixel art + chiptune-ish audio

You may reverse-engineer enough to understand the fantasy, then invent freely. Matching
spawn tables, fire rates, or stage layouts from the minified blob is **not** the goal.

## The game you must invent

**Cruiser Reloaded** should feel like a finished arcade product someone would replay. At
minimum it needs a coherent fantasy and a loop that creates “one more run” pressure.

Required pillars (design them; don’t just checklist them):

1. **Core verb that sings.** Flying and shooting must feel sharp. Fuel/health (or a
   modern equivalent resource tension) should create meaningful decisions, not just two
   bars that drain.
2. **Escalating threat.** Waves, denser debris, tougher drones, elite enemies, set-piece
   hazards, or bosses — difficulty must climb in a readable way across a run.
3. **Risk / reward.** Something that tempts greedy play: flying deeper into the debris
   for scrap, holding a multiplier by not taking damage, overclocking weapons at the
   cost of fuel, rescue pickups in dangerous lanes, etc.
4. **Progression inside a run.** Weapon mods, ship modules, combo routes, or mid-run
   choices that change how you play — not just a bigger score number.
5. **A reason to come back.** High-score chase, unlockable loadouts between runs,
   mission cards, daily seed, achievements, or a short unlock tree. Pick a meta that
   fits; ship it.
6. **Complete product shell.** Title / start flow, HUD, pause, game-over with run
   summary, audio (music + SFX), and readable instructions. No “tech demo” ending.
7. **Juice.** Hit feedback, explosions, combo popups, camera punch, UI snap — enough
   that clearing a lane feels good.

You are free to evolve the fantasy (classic side-scroller, twin-stick cruiser, mission
sorties, endless highway through the void, etc.) as long as the result is recognizably
descended from Retro Cruiser’s ship-in-debris identity and is **more complete and more
addictive** than the original.

## Technical requirements

1. **Modern stack.** Rebuild on a current, maintained engine/tooling (e.g. Phaser 3/4,
   Pixi, Canvas/WebGL + Vite). Real, readable source modules — **not** a re-minified
   blob and not a line-by-line port of the Phaser 2 game.
2. **Reuse the original assets.** Pull art/audio/fonts from `source/assets/`. You may
   re-encode, atlas, recolor, or extend them. Author new assets only when needed, and
   document provenance.
3. **Runs in modern browsers** and builds to a **static, deployable site**.
4. **Self-contained and documented.** README covering how to run it, the stack, the
   game design (loop, systems, why it should be addictive), what you took from the
   original vs invented, and anything still rough.

## Deliverable contract (so the harness can check it)

Write your solution into `solutions/cruiser-reloaded/` as a modern JS/TS project with:

- `solutions/cruiser-reloaded/package.json` containing:
  - a **`build`** script that emits a static site (into `dist/`, `build/`, `out/`, or
    `public/`, with an `index.html`),
  - a **`preview`** (or `start`/`dev`) script that serves it locally.
- real source modules for the game,
- the assets it needs (reused from `source/assets/` where possible),
- `solutions/cruiser-reloaded/README.md`.

The automated check (`bench verify cruiser-reloaded`) installs deps, runs `build`, and
confirms a servable static site. Passing that gate is necessary but not sufficient —
**fun, completeness, and addictiveness are scored by hand** against `RUBRIC.md`.

## Out of scope

Faithful recreation of the original’s spawn tables / fire rates / stage layouts,
multiplayer / netcode, accounts, and backend services. Invent the game; don’t clone the
lost source.
