# Asteroid Engine Demo, Modernized

Build with one command:

```bash
./build.sh
```

Run after building:

```bash
./run.sh
```

`build.sh` drives CMake, which fetches and builds SDL2 from source. The game no longer
requires system GLUT, OpenGL, OpenAL, or alut packages. It keeps the original asteroid
demo assets in `Resources/` and loads `GameAtlas.tga` and the original wav files at
runtime.

The final runtime bundle is written to `dist/asteroids` with `dist/Resources/` beside it.
Intermediate CMake files are kept under `${TMPDIR:-/tmp}` so the solution tree stays
small and the runnable artifact is easy to identify.

What changed:

- Replaced the old GLUT window loop with SDL2 window, input, timing, and rendering.
- Replaced OpenAL/alut playback with a small SDL2 audio mixer for the original wav files.
- Kept the original gameplay shape: background, rotating ship, asteroids, plasma shots,
  explosion animation, collision removal, and the same controls.
- Added a CMake-based one-command build that fetches native dependencies itself.

Controls:

- `J` / `K`: rotate the ship.
- `Space`: fire.
- `A`: spawn an asteroid immediately.
- `N`: respawn the ship after it is destroyed.
- `Escape` or window close: quit.
