#!/usr/bin/env bash
# Fetch the original engine + demo source (same pins as asteroid-engine) into
# $BENCH_SOURCE. For voidbreaker this is inspiration + asset DNA, not a port target.
# Re-runnable: pass --force to refetch.
set -euo pipefail

SRC="${BENCH_SOURCE:?BENCH_SOURCE not set (run via: pnpm bench setup voidbreaker)}"
FORCE="${1:-}"

# name|url|commit
REPOS=(
  "Game_Engine|https://github.com/ralphsmith80/Game_Engine|6ad9544638c247de0ead285a5e36b244949cf036"
  "Asteroid_Demo|https://github.com/ralphsmith80/Asteroid_Demo|94567640000cf0ad7fdfef95b0ea5cd972c1d281"
)

fetch_pinned() {
  local name="$1" url="$2" sha="$3" dest="$SRC/$1"
  if [[ -d "$dest" && "$FORCE" != "--force" ]]; then
    echo "  • $name already present (use --force to refetch) — skipping"
    return 0
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  echo "  • fetching $name @ ${sha:0:10} …"
  (
    cd "$dest"
    git init -q
    git remote add origin "$url"
    if ! git fetch -q --depth 1 origin "$sha" 2>/dev/null; then
      echo "    (shallow SHA fetch unsupported; doing a full fetch)"
      git fetch -q origin
    fi
    git checkout -q "$sha"
    rm -rf .git
  )
}

strip_artifacts() {
  local dir="$1"
  find "$dir" -depth \( \
        -iname 'Debug' -o -iname 'Release' -o -iname '.vs' -o -iname 'build' \
     \) -type d -exec rm -rf {} + 2>/dev/null || true
  find "$dir" -type f \( \
        -iname '*.ncb' -o -iname '*.suo' -o -iname '*.pdb' -o -iname '*.user' \
     -o -iname '*.o'   -o -iname '*.obj' -o -iname '*.ilk' -o -iname '*.idb' \
     -o -name 'asteroids_mac' -o -name 'asteroids_linux' -o -name 'asteroids' \
     \) -delete 2>/dev/null || true
}

echo "Fetching pinned source into: $SRC"
mkdir -p "$SRC"
for entry in "${REPOS[@]}"; do
  IFS='|' read -r name url sha <<< "$entry"
  fetch_pinned "$name" "$url" "$sha"
  strip_artifacts "$SRC/$name"
done

cat > "$SRC/README.FETCHED.md" <<'EOF'
# Original source (fetched, do not edit)

Materialized by `bench setup voidbreaker` from pinned commits.
Treat as **read-only inspiration + asset pack** — not a port target.

- `Game_Engine/`  — the standalone 2D engine + a thin asteroids reference demo.
- `Asteroid_Demo/` — the packaged desktop demo (same gameplay DNA).

Build artifacts were stripped; game assets under `Resources/` are kept so you can
reuse or reinterpret ship / asteroid / plasma / explosion / audio art.

The reimagined game goes in `../../../solutions/voidbreaker/`, not here.
EOF

echo "Done."
