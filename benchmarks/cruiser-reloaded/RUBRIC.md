# Rubric — Cruiser Reloaded

Score each criterion, multiply by its weight, total out of **100**. `bench verify`
confirms it builds and serves; this rubric is where you judge whether the *game* is a
finished, addictive arcade product. Play it. The live original at
https://ralphunlimited.com/blog/retro-cruiser/ is **inspiration only** — the candidate
should clearly outgrow it, not match it beat-for-beat.

**Score scale:** 0 = absent/broken · 1 = barely · 2 = partial · 3 = solid · 4 = very good
· 5 = excellent.

| # | Criterion | What "5" looks like | Weight | Score (0–5) | Weighted |
|---|-----------|---------------------|:------:|:-----------:|:--------:|
| 1 | **Addictive core loop** | Flight/shooting feel great; resource tension and risk/reward create real “one more run” pull within a few minutes. | ×6 | | |
| 2 | **Complete game, not a demo** | Title, HUD, pause, game-over/run summary, audio, instructions — a product shell with a finished loop. | ×4 | | |
| 3 | **Systems depth** | Mid-run progression and escalating threats change decisions; not just score + denser rocks. | ×4 | | |
| 4 | **Asset identity & juice** | Uses/extends original art/audio identity; hits, pickups, and deaths feel punchy. | ×2 | | |
| 5 | **Modern stack & code quality** | Current tooling, readable modular source, sensible project layout — not a re-minified blob. | ×2 | | |
| 6 | **Documentation & design honesty** | README explains the loop, systems, stack, and what came from the original vs new work. | ×2 | | |
|   |           |                     |        | **Total**   | **/100** |

> Max weighted = (6+4+4+2+2+2) × 5 = 100.

## Automated gate (from `bench verify`)

- [ ] `package.json` with a `build` script
- [ ] `install` + `build` succeed
- [ ] a static site with `index.html` is produced
- [ ] a `preview`/`start`/`dev` server responds locally (best-effort)

## Play-test checklist

Play for several runs and note:

- [ ] controls feel sharp within the first 30 seconds
- [ ] fuel/health (or equivalent) creates real decisions
- [ ] difficulty escalates in a readable way
- [ ] there is a greedy choice that can punish or reward you
- [ ] something changes mid-run beyond raw score
- [ ] game-over makes you want another attempt
- [ ] it still feels descended from Retro Cruiser’s identity

## Notes / observations

_(What hooked you, what felt thin, where the design peaked or fell flat.)_
