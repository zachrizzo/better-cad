#!/usr/bin/env bash
set -euo pipefail

echo "Building WASM..."
bash "$(dirname "$0")/build-wasm.sh"

echo "Starting Vite dev server..."
cd "$(dirname "$0")/../packages/ui"
pnpm dev
