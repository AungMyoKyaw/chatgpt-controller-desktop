# Installation

The currently documented platform is **macOS Apple Silicon**. This guide covers source builds while public downloadable releases remain unverified.

## Requirements

- macOS on ARM64/Apple Silicon.
- Google Chrome installed locally.
- [Bun](https://bun.sh/), Rust toolchain and Apple Command Line Tools for a source build.
- An installed Playwright CLI: the current v0.1.0 build **does not bundle it**.

Install Playwright CLI:

```bash
bun add -g @playwright/cli
playwright-cli --help
```

## Source checkout

The repository is private at present. The commands below are usable after access is granted or the repository is made public.

```bash
git clone git@github.com:AungMyoKyaw/chatgpt-controller-desktop.git
cd chatgpt-controller-desktop
make install
make dev
```

The development command builds the Bun sidecar and launches the native Tauri application.

## Build a macOS app

```bash
bun run check
cargo test --manifest-path src-tauri/Cargo.toml
make build
open "src-tauri/target/release/bundle/macos/ChatGPT Controller.app"
```

The current build is not verified as signed and notarized. Depending on macOS settings, a locally built application may require manual approval in **System Settings → Privacy & Security**.

## Connect

1. Open the app's **Getting started** page.
2. Click **Open ChatGPT login**.
3. Sign in inside the visible dedicated Chrome profile.
4. Start the controller and check the health indicators.
5. Copy the endpoint and local controller key from **API access**.

For supported requests, see the [API reference](../api-reference/).
