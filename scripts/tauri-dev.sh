#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAURI_BIN="$ROOT_DIR/packages/ui/node_modules/.bin/tauri"

cd "$ROOT_DIR"

if [ ! -x "$TAURI_BIN" ]; then
  echo "Missing UI dependencies. Run 'pnpm install' from the repo root first." >&2
  exit 1
fi

echo "Building WASM package..."
bash "$ROOT_DIR/scripts/build-wasm.sh"

"$TAURI_BIN" dev -c crates/bcad-tauri/tauri.conf.json
