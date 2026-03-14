# BetterCAD build commands

# Build WASM package
build-wasm:
    bash scripts/build-wasm.sh

# Start web dev server (builds WASM first)
dev:
    bash scripts/dev.sh

# Start Tauri desktop dev
tauri-dev:
    bash scripts/tauri-dev.sh

# Check all Rust code compiles
check-all:
    cargo check --workspace
    cargo check --workspace --target wasm32-unknown-unknown

# Run all Rust tests
test-all:
    cargo test --workspace

# Lint all Rust code
lint-all:
    cargo clippy --workspace -- -D warnings

# Full CI check
ci: check-all test-all lint-all
    cd packages/ui && npx tsc --noEmit
