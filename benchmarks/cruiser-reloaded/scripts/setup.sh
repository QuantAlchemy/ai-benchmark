#!/usr/bin/env bash
# Fetch the deployed Retro Cruiser bundle (minified game + assets), pinned to an exact
# commit, into $BENCH_SOURCE. For cruiser-reloaded this is inspiration + asset DNA,
# not a fidelity target. Uses a sparse checkout. Re-runnable: pass --force to refetch.
set -euo pipefail

SRC="${BENCH_SOURCE:?BENCH_SOURCE not set (run via: pnpm bench setup cruiser-reloaded)}"
FORCE="${1:-}"

URL="https://github.com/ralphsmith80/ralphunlimited"
SHA="7ddc89f44ec3fdb231bc187d273b33bc3fbc698b"
SUBPATH="public/games/retro-cruiser"

if [[ -e "$SRC/index.html" && "$FORCE" != "--force" ]]; then
  echo "  • Retro Cruiser source already present (use --force to refetch) — skipping"
  exit 0
fi

echo "Fetching deployed bundle @ ${SHA:0:10} (sparse: $SUBPATH) into: $SRC"
rm -rf "$SRC"
mkdir -p "$SRC"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(
  cd "$TMP"
  git init -q
  git remote add origin "$URL"
  git config core.sparseCheckout true
  git sparse-checkout set --no-cone "$SUBPATH" >/dev/null 2>&1 || \
    printf '%s\n' "$SUBPATH/*" > .git/info/sparse-checkout
  if ! git fetch -q --depth 1 origin "$SHA" 2>/dev/null; then
    echo "  (shallow SHA fetch unsupported; doing a full fetch — this is larger)"
    git fetch -q origin
  fi
  git checkout -q "$SHA"
)

shopt -s dotglob
mv "$TMP/$SUBPATH"/* "$SRC"/
shopt -u dotglob

cat > "$SRC/README.FETCHED.md" <<'EOF'
# Original deployed bundle (fetched, do not edit)

Materialized by `bench setup cruiser-reloaded` from a pinned commit.
Treat as **read-only inspiration + asset pack** — not a fidelity target.

- `index.html`      — the page that boots the original game.
- `index.min.js`    — the ENTIRE original, minified, with Phaser 2.0.7 bundled in.
                      Useful for recovering ideas; do not treat as a clone checklist.
- `phaser.map`      — source map for the Phaser portion.
- `css/`            — page styling.
- `assets/`         — original images, audio, and fonts. Reuse these heavily.

The reimagined game goes in `../../../solutions/cruiser-reloaded/`, not here.
Live original (inspiration): https://ralphunlimited.com/blog/retro-cruiser/
EOF

echo "Done. Entry point: $SRC/index.html  (inspiration: https://ralphunlimited.com/blog/retro-cruiser/)"
