#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bun scripts/export-playwright-templates.ts
cargo build --locked --release --manifest-path native-controller/Cargo.toml --target aarch64-apple-darwin
install -m 755 native-controller/target/aarch64-apple-darwin/release/chatgpt-controller-native src-tauri/bin/controller
file src-tauri/bin/controller
