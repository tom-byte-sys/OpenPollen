#!/usr/bin/env bash
set -euo pipefail

# Build the HiveAgent control UI into dist/control-ui/
# Uses the ui/ directory within the project.

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${PROJECT_ROOT}/dist/control-ui"
UI_DIR="${PROJECT_ROOT}/ui"

echo "=== HiveAgent UI Build Script ==="
echo "Project root: ${PROJECT_ROOT}"
echo "Output dir:   ${OUTPUT_DIR}"
echo "UI source:    ${UI_DIR}"
echo ""

# Ensure ui/ directory exists
if [ ! -d "${UI_DIR}" ]; then
  echo "ERROR: UI source not found at ${UI_DIR}"
  exit 1
fi

# Build using the project's vite config
cd "${PROJECT_ROOT}"
HIVEAGENT_CONTROL_UI_BASE_PATH="./" npx vite build --config ui/vite.config.ts ui

echo ""
echo "=== Build complete ==="
echo "Output: ${OUTPUT_DIR}"
ls -la "${OUTPUT_DIR}/"
