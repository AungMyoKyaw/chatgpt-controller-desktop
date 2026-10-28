# Installation

ChatGPT Controller **v0.1.0** is publicly available for **macOS Apple Silicon (ARM64)** through the Homebrew tap or [GitHub Releases](https://github.com/AungMyoKyaw/chatgpt-controller-desktop/releases/tag/v0.1.0).

## Install with Homebrew (recommended)

```bash
brew install --cask AungMyoKyaw/homebrew-tap/chatgpt-controller
```

To upgrade later, run `brew upgrade --cask AungMyoKyaw/homebrew-tap/chatgpt-controller`. To uninstall, run `brew uninstall --cask AungMyoKyaw/homebrew-tap/chatgpt-controller`. An explicit `--zap` also removes app-owned local settings and the dedicated browser profile.

Alternatively, download the `ChatGPT-Controller-v0.1.0-macos-arm64.zip` archive from the release, verify its `SHA256SUMS`, extract it, and move **ChatGPT Controller.app** into Applications.

## Requirements

- macOS on ARM64/Apple Silicon.
- Google Chrome installed locally.
- [Bun](https://bun.sh/), Rust toolchain and Apple Command Line Tools **only for source builds**.
- An installed Playwright CLI: the current v0.1.0 build **does not bundle it**.

Install Playwright CLI:

```bash
bun add -g @playwright/cli
playwright-cli --help
```

## Source checkout

The source repository is public. For a development checkout:

```bash
git clone git@github.com:AungMyoKyaw/chatgpt-controller-desktop.git
cd chatgpt-controller-desktop
make install
make dev
```

The development command compiles the native Rust controller sidecar and launches the Tauri application. Bun is required to build from source, but no Bun runtime is distributed inside the finished app.

## Build a macOS app

```bash
bun run check
cargo test --manifest-path src-tauri/Cargo.toml
make build
open "src-tauri/target/release/bundle/macos/ChatGPT Controller.app"
```

Published v0.1.0 builds use ad-hoc signing, **not Developer ID signing or Apple notarization**. The Homebrew cask runs a nonfatal, recursive `xattr` postflight step to remove `com.apple.quarantine` from only the installed app bundle. Direct downloads, or systems where the postflight step fails, may require manual approval in **System Settings → Privacy & Security**.

## Connect

1. Open the app's **Getting started** page.
2. Click **Open ChatGPT login**.
3. Sign in inside the visible dedicated Chrome profile.
4. Start the controller and check the health indicators.
5. Copy the endpoint and local controller key from **API access**.

For supported requests, see the [API reference](../api-reference/).
