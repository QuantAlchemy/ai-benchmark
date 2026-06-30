# Rubric — Asteroid Engine Demo

Score each criterion, multiply by its weight, and total out of **100**. `bench verify`
already gives you an objective read on the build gate; this rubric is where you judge how
*good* the result is. Fill in the **Score (0–5)** column.

**Score scale:** 0 = absent/broken · 1 = barely · 2 = partial · 3 = solid · 4 = very good
· 5 = excellent.

| # | Criterion | What "5" looks like | Weight | Score (0–5) | Weighted |
|---|-----------|---------------------|:------:|:-----------:|:--------:|
| 1 | **One command, zero manual deps** *(the whole point)* | `./build.sh` builds from clean on a box with no OpenGL/GLUT/OpenAL installed; deps vendored/fetched automatically. | ×7 | | |
| 2 | **Runs on a modern machine** | Compiles with a current toolchain & GL stack and actually launches and plays; no deprecated-API crashes. | ×5 | | |
| 3 | **Faithful to the original** | Recognizably the same asteroids demo — ship, asteroids, shooting, same assets and sounds. | ×4 | | |
| 4 | **Quality of modernization** | Clean, minimal, sensible changes to engine/demo; deprecated GL handled well; no hacks left behind. | ×2 | | |
| 5 | **Documentation** | README clearly states the one command, what changed, and how deps are now handled. | ×1 | | |
| 6 | **Cross-platform (bonus)** | Also builds/runs on macOS and/or Windows, cleanly. | ×1 | | |
|   |           |                     |        | **Total**   | **/100** |

> Max weighted = (7+5+4+2+1+1) × 5 = 100.

## Automated gate (from `bench verify`)

- [ ] `build.sh` exists and is a single command
- [ ] `build.sh` succeeds on a machine **without** OpenGL/GLUT/OpenAL pre-installed
- [ ] a runnable executable is produced
- [ ] `run.sh` launches the game (best-effort; may be unverifiable in a headless CI)

A solution that fails the first three bullets should be capped low on criterion #1
regardless of everything else — that gap is the entire reason this benchmark exists.

## Notes / observations

_(What broke, what was clever, what you had to install by hand to make it work, etc.)_
