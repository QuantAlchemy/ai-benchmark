# Original source (fetched, do not edit)

This directory is materialized by `bench setup asteroid-engine` from pinned commits
and is read-only reference input for the benchmark.

- `Game_Engine/`  — the standalone 2D engine + a reference desktop demo.
- `Asteroid_Demo/` — the packaged demo (desktop `Asteroid_Demo/` + `Asteroid_Demo_iPhone/`).

Build artifacts (Debug/, *.ncb, *.suo, prebuilt binaries) were stripped; game assets
under `Resources/` are kept because the demo needs them at runtime.

The model's modernized port goes in `../../../solutions/asteroid-engine/`, not here.
