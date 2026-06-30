#!/usr/bin/env bash
# Smoke-test a candidate solution. This is an OBJECTIVE pass/fail gate, not the grade:
# the whole point of the benchmark is "one command, no manual dependency installs",
# so the test simply runs the solution's single build command on THIS machine and
# checks it produces a runnable game. If it builds here without you hand-installing
# OpenGL/GLUT/OpenAL first, the core goal is met.
#
# Solution contract (see TASK.md):
#   <solution>/build.sh   executable; builds everything with ONE command, fetching any
#                         native deps itself. Exit 0 on success.
#   <solution>/run.sh     executable; launches the built game.
set -uo pipefail

SOL="${BENCH_SOLUTION:?BENCH_SOLUTION not set}"
fails=0
note() { printf '  %s\n' "$*"; }

echo "Solution: $SOL"
[[ -d "$SOL" ]] || { echo "FAIL: solution directory does not exist."; exit 2; }

# 1. Required entry points -----------------------------------------------------
if [[ -f "$SOL/build.sh" ]]; then
  note "✓ build.sh present"
  [[ -x "$SOL/build.sh" ]] || { note "  (making build.sh executable)"; chmod +x "$SOL/build.sh"; }
else
  note "✗ build.sh missing — the benchmark requires a single-command ./build.sh"
  fails=$((fails+1))
fi

if [[ -f "$SOL/run.sh" ]]; then
  note "✓ run.sh present"
  [[ -x "$SOL/run.sh" ]] || chmod +x "$SOL/run.sh"
else
  note "✗ run.sh missing — provide ./run.sh to launch the game"
  fails=$((fails+1))
fi

[[ $fails -gt 0 ]] && { echo; echo "FAIL: missing required entry points ($fails)."; exit 1; }

# 2. The single build command --------------------------------------------------
echo
echo "── Running ./build.sh (this is the real test: no manual deps allowed) ──"
build_start=$(date +%s)
( cd "$SOL" && ./build.sh )
build_code=$?
build_end=$(date +%s)
if [[ $build_code -ne 0 ]]; then
  echo
  echo "FAIL: build.sh exited $build_code. A passing solution builds with one command."
  exit 1
fi
note "✓ build.sh succeeded in $((build_end - build_start))s"

# 3. Did it produce a runnable artifact? --------------------------------------
echo
echo "── Checking for a built executable ──"
mapfile -t bins < <(find "$SOL" -type f -perm -u+x \
  ! -name '*.sh' ! -path '*/.git/*' ! -path '*/source/*' 2>/dev/null \
  | xargs -r file 2>/dev/null | grep -iE 'ELF|Mach-O|executable' | cut -d: -f1)
if [[ ${#bins[@]} -gt 0 ]]; then
  note "✓ found executable: ${bins[0]}"
else
  note "! no obvious native executable found (it may be wrapped by run.sh) — review by hand"
fi

# 4. Best-effort headless launch ----------------------------------------------
# OpenGL needs a display; only attempt if a virtual framebuffer is available.
echo
echo "── Best-effort launch (non-fatal; needs a display/audio device) ──"
launch() {
  if command -v xvfb-run >/dev/null 2>&1; then
    note "launching under xvfb-run for ~5s …"
    ( cd "$SOL" && timeout 5s xvfb-run -a ./run.sh ) >/dev/null 2>&1
  else
    note "launching for ~5s (no xvfb; may fail without a display) …"
    ( cd "$SOL" && timeout 5s ./run.sh ) >/dev/null 2>&1
  fi
}
launch
rc=$?
# timeout kills with 124 when the game is still running = it launched and stayed up.
if [[ $rc -eq 124 || $rc -eq 0 ]]; then
  note "✓ game launched (ran until timeout / clean exit)"
else
  note "! could not confirm launch (exit $rc) — likely no display in this environment."
  note "  Build passed, so this is informational; verify the run manually."
fi

echo
echo "PASS: builds with a single command. Now grade quality with: bench score asteroid-engine"
exit 0
