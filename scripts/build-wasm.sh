#!/usr/bin/env bash
set -euo pipefail

echo "Building WASM package..."
cd "$(dirname "$0")/../crates/bcad-wasm"
wasm-pack build --target web --out-dir ../../packages/wasm-pkg
echo "WASM build complete -> packages/wasm-pkg/"
