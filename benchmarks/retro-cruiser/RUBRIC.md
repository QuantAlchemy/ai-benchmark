# Rubric — Retro Cruiser

Score each criterion, multiply by its weight, total out of **100**. `bench verify` confirms
it builds and serves; this rubric is where you judge whether the *game* is right — play the
candidate next to the original at https://ralphunlimited.com/blog/retro-cruiser/.

**Score scale:** 0 = absent/broken · 1 = barely · 2 = partial · 3 = solid · 4 = very good
· 5 = excellent.

| # | Criterion | What "5" looks like | Weight | Score (0–5) | Weighted |
|---|-----------|---------------------|:------:|:-----------:|:--------:|
| 1 | **Core gameplay fidelity** | Ship, movement, weapons/shooting, enemies, collisions, pickups and scoring all behave like the original. | ×6 | | |
| 2 | **Completeness** | Title screen, stages/levels, win/lose, game-over, HUD, music & SFX — the whole loop is present, not just a tech demo. | ×4 | | |
| 3 | **Asset fidelity** | Uses the original art/audio/fonts; looks and sounds like Retro Cruiser. | ×3 | | |
| 4 | **Modern stack & code quality** | Current Phaser, sane build (e.g. Vite), readable modular source — not a re-minified blob. | ×3 | | |
| 5 | **Runs & deploys cleanly** | Builds to a static site, runs smoothly in a modern browser, no console errors. | ×2 | | |
| 6 | **Documentation & honesty** | README explains the stack, how behavior was recovered, and clearly flags anything guessed or missing. | ×2 | | |
|   |           |                     |        | **Total**   | **/100** |

> Max weighted = (6+4+3+3+2+2) × 5 = 100.

## Automated gate (from `bench verify`)

- [ ] `package.json` with a `build` script
- [ ] `install` + `build` succeed
- [ ] a static site with `index.html` is produced
- [ ] a `preview`/`start`/`dev` server responds locally (best-effort)

## Side-by-side play test

Play both and note differences:

- [ ] controls feel the same
- [ ] enemy types & spawn patterns match
- [ ] weapons / fire rate / projectiles match
- [ ] pickups / boosts behave the same
- [ ] scoring & difficulty curve match
- [ ] audio (music + SFX) matches
- [ ] title / game-over / transitions match

## Notes / observations

_(What matched, what's off, what was clearly guessed or couldn't be recovered from the
minified bundle.)_
