# Relay — ChatGPT conversation desktop client

A focused light-first **macOS native desktop application** built with **Tauri 2, Rust, Svelte 5, SvelteKit, Tailwind CSS 4 and Bun**. UI direction developed using **Impeccable** (Operate mode, *Quiet Workbench*) and documented in [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md).

Relay controls your own **signed-in ChatGPT web browser** using the pre-existing localhost bridge. It does **not** extract, store, or replay your ChatGPT session credentials, and it is not affiliated with OpenAI.

## Prerequisites

The local controller must be running:

- Chrome session: `playwright-cli -s=chatgpt-research` (headed, logged into ChatGPT)
- HTTP controller: `http://127.0.0.1:8791`
- Local bridge key: `~/.config/chatgpt-browser-controller/bridge.key` (read **only** by Tauri's Rust process)

The controller's source lives at `../chatgpt-api-research/clients/typescript`. To start it, follow its setup guide. It authenticates localhost API requests with a dedicated local bridge key, not a pasted ChatGPT token.

## Start for development

```bash
cd ~/Code/mcp-workspace/projects/chatgpt-desktop-client
bun install
bun run tauri dev
```

## Build macOS application

```bash
bun run check
bun run build
cd src-tauri && cargo test
cd ..
bun run tauri build --bundles app
open src-tauri/target/release/bundle/macos/Relay.app
```

The macOS `.app` bundle is currently built **without Apple Developer signing/notarization**. macOS may display a security warning if you copy it to another machine.

## Features

- Light-first interface with dark mode and accessible high-contrast states
- Search/filter loaded conversation sidebar
- Create a ChatGPT conversation
- Continue a specific conversation, preserving its ChatGPT history
- Read messages from an existing conversation
- Rename, archive, and delete individual conversations (confirmation before delete)
- Sanitize and render Markdown responses, copy reply text
- Keyboard: `⌘N` new chat, `⌘K` focus conversation search, `⌘R` refresh, Enter send, Shift+Enter new line
- Connection status, retry, upstream error and busy states, safe localhost-only Rust proxy

## Architecture

```text
Relay macOS app (SvelteKit + Tailwind)
        |
        | Tauri invoke("bridge_call")
        v
Tauri Rust backend (reqwest + allowlisted operations)
        |
        | HTTP on 127.0.0.1:8791 + local key from ~/.config/
        v
Local Conversation Controller (Bun + Playwright CLI)
        |
        | Automates existing signed-in Chrome
        v
chatgpt.com (browser's normal application requests)
```

The frontend **never receives the localhost bridge key**. Rust accepts only `health`, `list`, `read`, `send`, `open`, `rename`, `archive`, and `delete` operations. The upstream controller rejects concurrent browser actions; Relay shows an error instead of silently retrying submitted messages.

## Important limitations

- It is **browser automation**, not a documented ChatGPT backend API integration. Changes to the website can break the automation.
- The list contains only conversations currently loaded in the browser's sidebar; this is not an exhaustive history export.
- Existing conversation loads can fail with upstream HTTP 429. Relay displays an error rather than posting to an incorrectly selected chat.
- True token-by-token streaming is **not** available in the bridge; a reply is displayed after completion. Usage limits still apply.
- Requires a running logged-in Chrome browser and localhost controller.
- No support yet for attachments, model switching, per-user multi-account profiles, image rendering or voice.
- Release is unsigned/unnotarized until a developer certificate is configured.

## Quality assurance

- Impeccable 4.4.0 context, new-product direction and craft-floor read; UI detector inspected the page (neutral blockquote border refined after warning).
- `bun run check` and `bun run build` pass.
- `cargo check` and `cargo test` pass.
- Browser preview and actual macOS native window were visually inspected.
- Local bridge access/listing were verified earlier; upstream authenticated chat creation and follow-up had been tested at the bridge layer.
