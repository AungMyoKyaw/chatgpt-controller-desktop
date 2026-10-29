#!/usr/bin/env bash
set -euo pipefail
tag="$1"
test -n "$tag" || { echo "Release tag required" >&2; exit 2; }
cat <<'EOF' | sed "s/RELEASE_VERSION/$tag/g"
## ChatGPT Controller RELEASE_VERSION

Native macOS Apple Silicon application offering an authenticated localhost API for a user-managed ChatGPT session.

### Known limitations
Live message retrieval, conversation status, sending, and sign-in compatibility have not been fully verified; this is not yet a fully compatible drop-in replacement for v0.2.0.

### Install
Use Homebrew: brew install --cask aungmyokyaw/tap/chatgpt-controller
Or download the attached ARM64 ZIP and move ChatGPT Controller.app to Applications.

### Architecture
- Rust Axum controller embedded in the Tauri application process.
- macOS WKWebView sign-in and browser fallback; no mandatory Chrome or Playwright CLI.
- Native Rust HTTP fast path where the authenticated session permits.
- Bun is used for source builds only, never required by end users.

### Requirements
- Apple Silicon Mac and a ChatGPT account.
- Sign in directly on chatgpt.com in the embedded WebKit browser.
- Local API binds to 127.0.0.1:8791 with the separate X-Bridge-Key.

### Distribution
- Ad-hoc signed, not Developer ID signed or notarized.
- System Settings > Privacy & Security may be needed for first launch.
- Check the release ZIP against SHA256SUMS.
- This is an independent unofficial project, not the official OpenAI API.
- AGPL-3.0-or-later.
EOF
