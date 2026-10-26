#!/usr/bin/env bash
set -e

# Resolve project root relative to script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

if [ ! -f "${PROJECT_ROOT}/build/src/cli.js" ]; then
  echo "Building Lumi CLI compiler..."
  (cd "${PROJECT_ROOT}" && npm run build)
fi

node "${PROJECT_ROOT}/build/src/cli.js" "$@"
