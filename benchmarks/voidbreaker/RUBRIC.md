# Rubric — Voidbreaker

Score each criterion, multiply by its weight, total out of **100**. `bench verify`
confirms it builds and serves; this rubric is where you judge whether the *game* is a
finished, addictive arcade product. Play it. Compare the feeling to the thin 2010
demo — the candidate should clearly outgrow it.

**Score scale:** 0 = absent/broken · 1 = barely · 2 = partial · 3 = solid · 4 = very good
· 5 = excellent.

| # | Criterion | What "5" looks like | Weight | Score (0–5) | Weighted |
|---|-----------|---------------------|:------:|:-----------:|:--------:|
| 1 | **Addictive core loop** | Movement/shooting feel great; risk/reward and escalation create real “one more run” pull within a few minutes. | ×6 | | |
| 2 | **Complete game, not a demo** | Title, HUD, pause, game-over/run summary, audio, instructions — a product shell with a finished loop. | ×4 | | |
| 3 | **Systems depth** | Mid-run progression and escalating threats change decisions; not just score + spawn rate. | ×4 | | |
| 4 | **Juice & feedback** | Hits, deaths, combos, and pickups feel punchy; audio/VFX support the fantasy. | ×2 | | |
| 5 | **Modern stack & code quality** | Current tooling, readable modular source, sensible project layout. | ×2 | | |
| 6 | **Documentation & design honesty** | README explains the loop, systems, stack, and what came from original assets vs new work. | ×2 | | |
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
- [ ] difficulty escalates in a readable way
- [ ] there is a greedy choice that can punish or reward you
- [ ] something changes mid-run beyond raw score
- [ ] game-over makes you want another attempt
- [ ] audio + feedback make destruction satisfying
- [ ] it still feels descended from the asteroid demo’s identity

## Notes / observations

_(What hooked you, what felt thin, where the design peaked or fell flat.)_
