# Task: Modernize the Asteroid engine demo for a one-command build

You are given a 2D game engine and an "asteroids" demo written in C++ around 2010. Your
job is to make the demo **build and run on a current machine** with a **single command**
and **no manual dependency installation**.

## Background

- The engine is a small platform-independent 2D engine. It renders with **OpenGL** via
  **GLUT**, and plays audio via **OpenAL / alut**.
- The original build is a hand-written `Makefile` that assumes OpenGL, GLUT, and OpenAL
  are already installed system-wide. On Linux it links `-lglut -lGLU -lalut`; on macOS it
  links the `OpenGL`, `GLUT`, and `OpenAL` frameworks. There is also an old Visual Studio
  project and an iPhone Xcode project.
- The historical pain point: you had to go find, download, and install OpenGL/GLUT/OpenAL
  yourself before it would compile. **Eliminating that is the core of this task.**

## What you're given

Under `source/` (read-only reference input):

- `source/Game_Engine/` — the standalone engine plus a reference desktop demo
  (`main.cpp`, `game.h`, `Engine/*.cpp|*.h`, `Resources/`, original `Makefile`).
- `source/Asteroid_Demo/` — the packaged demo: a desktop build (`Asteroid_Demo/`) and an
  iPhone build (`Asteroid_Demo_iPhone/`).

The `Resources/` folders hold the game assets (textures, audio, fonts) the demo loads at
runtime — keep using them.

## Requirements

1. **One command, zero manual deps.** A fresh checkout must build with a single command
   (e.g. `./build.sh`). It must obtain OpenGL/GLUT/OpenAL (or modern equivalents) on its
   own — vendored, fetched by the build, or pulled via a package/dependency manager the
   script drives. The grader runs your build on a machine where these libraries are **not**
   pre-installed. "Tell the user to `apt install …`" does **not** count.
2. **Runs on modern machines.** It must compile and run with a current toolchain and a
   current OpenGL stack. Update engine/demo code as needed (deprecated GL calls, C++
   standard issues, 64-bit, etc.). GLUT may be replaced with a maintained equivalent
   (e.g. FreeGLUT, or GLFW/SDL2) and alut/OpenAL with a maintained audio path, as long as
   the game plays the same.
3. **Same game.** The result must be recognizably the original asteroids demo: ship,
   asteroids, shooting, the same assets and sounds.
4. **Cross-platform is a bonus, Linux is the floor.** It must build & run on modern Linux.
   Keeping macOS and/or Windows working too is a plus. The iPhone project is out of scope.
5. **Document it.** A short README explaining the single build command, what changed, and
   how dependencies are now handled.

## Deliverable contract (so the harness can check it)

Write your solution into `solutions/asteroid-engine/` with at least:

- `solutions/asteroid-engine/build.sh` — **executable**; builds everything with one command, fetching any
  native dependencies itself; exits `0` on success.
- `solutions/asteroid-engine/run.sh` — **executable**; launches the built game.
- `solutions/asteroid-engine/README.md` — how it works and what you changed.
- the source you ship (your modernized engine + demo, or a clear vendoring of `source/`).

The automated check (`bench verify asteroid-engine`) runs `./build.sh` on a machine
**without** OpenGL/GLUT/OpenAL pre-installed and confirms it succeeds and produces a
runnable artifact. Passing that gate is necessary but not sufficient — quality is then
scored by hand against `RUBRIC.md`.

## Out of scope

The iPhone Xcode project, app-store packaging, new gameplay features, and netcode. Don't
add scope; modernize what's here.
