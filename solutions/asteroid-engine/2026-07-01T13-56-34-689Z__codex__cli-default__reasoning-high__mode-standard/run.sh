#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${ROOT_DIR}/dist/asteroids"

if [[ ! -x "${BIN}" ]]; then
  "${ROOT_DIR}/build.sh"
fi

cd "${ROOT_DIR}/dist"
exec "${BIN}" "$@"
