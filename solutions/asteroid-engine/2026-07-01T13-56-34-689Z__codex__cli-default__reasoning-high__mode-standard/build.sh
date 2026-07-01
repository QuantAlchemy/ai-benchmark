#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_KEY="$(printf '%s' "${ROOT_DIR}" | cksum | awk '{print $1}')"
BUILD_DIR="${TMPDIR:-/tmp}/asteroid-engine-build-${BUILD_KEY}"
DIST_DIR="${ROOT_DIR}/dist"

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake is required to drive the self-contained build." >&2
  exit 1
fi

mkdir -p "${DIST_DIR}"

cmake -S "${ROOT_DIR}" -B "${BUILD_DIR}" -DCMAKE_BUILD_TYPE=Release
cmake --build "${BUILD_DIR}" --parallel "${CMAKE_BUILD_PARALLEL_LEVEL:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)}"

cmake -E copy "${BUILD_DIR}/asteroids" "${DIST_DIR}/asteroids"
cmake -E copy_directory "${ROOT_DIR}/Resources" "${DIST_DIR}/Resources"

echo "Built ${DIST_DIR}/asteroids"
