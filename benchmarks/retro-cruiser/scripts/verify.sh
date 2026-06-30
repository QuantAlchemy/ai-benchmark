#!/usr/bin/env bash
# Smoke-test a candidate Retro Cruiser rebuild. Objective gate: it installs, builds, and
# produces a servable web app. Gameplay fidelity is judged by hand (RUBRIC.md) — a script
# can't tell if the game "feels right".
#
# Solution contract (see TASK.md):
#   <solution>/package.json with:
#       "build"   -> produces a static site (dist/ | build/ | out/ | public/)
#       "preview" or "start" or "dev" -> serves it locally
set -uo pipefail

SOL="${BENCH_SOLUTION:?BENCH_SOLUTION not set}"
note() { printf '  %s\n' "$*"; }

echo "Solution: $SOL"
[[ -d "$SOL" ]] || { echo "FAIL: solution directory does not exist."; exit 2; }
[[ -f "$SOL/package.json" ]] || { echo "FAIL: no package.json — expected a modern JS project."; exit 1; }
note "✓ package.json present"

# Force CommonJS: a parent package.json may set "type":"module", which would make
# `node -e` treat this snippet as ESM (no `require`) and silently fail every check.
have_script() {
  node --input-type=commonjs -e \
    'const s=(require(process.argv[1]).scripts)||{};process.exit(s[process.argv[2]]?0:1)' \
    "$SOL/package.json" "$1" 2>/dev/null
}

# Pick a package manager: respect a committed lockfile, else default to pnpm.
PM=pnpm
[[ -f "$SOL/package-lock.json" ]] && PM=npm
[[ -f "$SOL/yarn.lock" ]] && PM=yarn
[[ -f "$SOL/pnpm-lock.yaml" ]] && PM=pnpm
command -v "$PM" >/dev/null 2>&1 || { echo "FAIL: package manager '$PM' not found."; exit 1; }
note "using package manager: $PM"

echo
echo "── Installing dependencies ──"
( cd "$SOL" && "$PM" install ) || { echo; echo "FAIL: dependency install failed."; exit 1; }
note "✓ install succeeded"

echo
echo "── Building ──"
if have_script build; then
  ( cd "$SOL" && "$PM" run build ) || { echo; echo "FAIL: build failed."; exit 1; }
  note "✓ build succeeded"
else
  note "! no \"build\" script — assuming a no-build static/dev setup; continuing"
fi

echo
echo "── Locating build output ──"
OUTDIR=""
for d in dist build out public .output/public; do
  if [[ -f "$SOL/$d/index.html" ]]; then OUTDIR="$SOL/$d"; break; fi
done
if [[ -n "$OUTDIR" ]]; then
  note "✓ found static output with index.html: ${OUTDIR#$SOL/}"
  assets=$(find "$OUTDIR" -type f \( -name '*.js' -o -name '*.png' -o -name '*.jpg' \
            -o -name '*.mp3' -o -name '*.ogg' -o -name '*.wav' \) | wc -l | tr -d ' ')
  note "  bundled asset/script files: $assets"
else
  note "! no static index.html found in dist/build/out/public — may be dev-server only; review by hand"
fi

# Best-effort: start a server and confirm it answers with HTML.
echo
echo "── Best-effort serve check (non-fatal) ──"
SERVE=""
for s in preview start serve dev; do have_script "$s" && { SERVE="$s"; break; }; done
if [[ -z "$SERVE" ]]; then
  note "! no preview/start/dev script to launch a server — skipping"
else
  note "starting '$PM run $SERVE' for a few seconds …"
  ( cd "$SOL" && "$PM" run "$SERVE" ) >/tmp/rc_serve.log 2>&1 &
  SRV_PID=$!
  ok_http=0
  for port in 3000 4173 5173 8080 8000 4321; do
    for _ in 1 2 3; do
      sleep 1
      if curl -fsS "http://localhost:$port/" >/dev/null 2>&1; then
        note "✓ server responded on http://localhost:$port/"
        ok_http=1; break
      fi
    done
    [[ $ok_http -eq 1 ]] && break
  done
  kill "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null
  [[ $ok_http -eq 0 ]] && note "! could not confirm a local server (see /tmp/rc_serve.log) — verify manually"
fi

echo
echo "PASS: installs and builds. Now grade gameplay fidelity with: bench score retro-cruiser"
exit 0
