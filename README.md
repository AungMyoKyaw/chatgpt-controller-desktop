# ChatGPT Controller (macOS)

**ChatGPT Controller** is a native **Tauri 2 + Rust + Svelte 5 + Tailwind CSS 4** app for turning a person's locally signed-in ChatGPT browser into a **private localhost conversation API**.

This is a new standalone controller product. **Relay** is included separately in `samples/relay` as a sample client; the controller does not depend on Relay.

## Product workflow

1. Start the ChatGPT Controller desktop app.
2. Select **Open ChatGPT login** to launch a dedicated visible Chrome profile. The user signs in directly to ChatGPT in Chrome, not in the controller.
3. Click **Start controller** to launch the packaged Bun HTTP service, or adopt an already-running compatible local service.
4. Open **API access** to copy `http://127.0.0.1:8791`, reveal/copy the **controller-issued** local API key, or **Export API config (JSON)** to your clipboard.
5. Open **API explorer** to run an authenticated conversation-list request or intentionally create a test conversation.
6. Run `samples/relay` to see a separate Tauri/Svelte chat client using the same API.

**No browser cookies, OAuth tokens, passwords, or account-specific API keys are exported.** The controller key is generated locally and authorizes the localhost bridge only.

## Requirements

- macOS Apple Silicon and Chrome installed.
- **Playwright CLI** (`playwright-cli`; install with `bun add -g @playwright/cli`) installed and accessible in `~/.bun/bin`, `~/.local/bin`, `~/.local/share/mise/shims`, Homebrew's bin, or `PATH`. The controller detects whether it is installed.
- A ChatGPT account and a signed-in session in the dedicated Chrome profile.
- Local controller address `127.0.0.1:8791` must be available.

**Important current packaging limitation:** `@playwright/cli` is *not* bundled with this v0.1 app. A compiled Playwright CLI packaging attempt failed on unresolved `chromium-bidi` dependencies. Install it separately before using the login/start-to-chat workflow. The controller's Bun HTTP server **is bundled** with the macOS app.

## Run from source

```bash
cd ~/Code/mcp-workspace/projects/chatgpt-controller-desktop
make install
make dev
```

## Build release

```bash
bun run check
cargo test --manifest-path src-tauri/Cargo.toml
make build
open src-tauri/target/release/bundle/macos/ChatGPT\ Controller.app
```

The app contains a bundled Apple Silicon Bun controller binary in its `Contents/Resources/bin/controller` directory. Its release bundle is not signed or notarized.

Run `make format` to format the root app's frontend, controller, and Rust code. `make build` creates the macOS app bundle.

## Local API

- Base URL: `http://127.0.0.1:8791`
- Auth header: `X-Bridge-Key: <controller-generated-local-key>`
- Key file: `~/.config/chatgpt-browser-controller/bridge.key`, restricted to the current macOS user (mode `0600`).
- Browser session name: `chatgpt-controller`.
- Profile: `~/.playwright-cli/chatgpt-controller-profile`.
- Server log: `~/.config/chatgpt-browser-controller/controller.log`.

Example:

```bash
curl http://127.0.0.1:8791/v1/conversations \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)"
```

Create a conversation:

```bash
curl http://127.0.0.1:8791/v1/chat \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)" \
  -H "Content-Type: application/json" \
  --data '{"prompt":"Hello ChatGPT"}'
```

For follow-ups include `"conversation_path":"/c/<uuid>"` with the identifier returned by the first call.

Endpoint routes include `GET /health`, `GET /v1/conversations`, `GET /v1/conversations/{id}/messages`, `POST /v1/chat`, `PATCH /v1/conversations/{id}`, `POST /v1/conversations/{id}/archive`, and `DELETE /v1/conversations/{id}` with `{"confirm":true}`.

For the complete API and behavior notes, see `controller/bridge-server.ts` and the included Relay example.

## Architecture

```
ChatGPT Controller.app (Svelte UI)
   ↕ Tauri invokes
Rust process manager, API explorer and 0600 key storage
   ↕ starts bundled Bun HTTP service (loopback only)
Bun conversation API on 127.0.0.1:8791
   ↕ Playwright CLI (installed separately)
Dedicated Chrome profile → signed-in chatgpt.com
                            ↑
Relay sample app → localhost API + independent local key
```

An already-running server at the configured port is detected rather than killed; the app can stop **only** a process it started.

## Design methodology

The included `PRODUCT.md` and `DESIGN.md` document the **Impeccable Operate-mode** design: *Quiet Control Room*, light-first macOS styling, usable status-first actions, explicit error states and dark mode. The source is Svelte 5 with Tailwind CSS 4, custom tokens and Lucide icons.

## License

This project and the included Relay sample are licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).

## Limitations and safety

- These are *undocumented internal browser workflows*, not the official OpenAI API. ChatGPT could change its website.
- Subscription usage limits and server rate limits still apply. No CAPTCHA bypass or quota-evasion logic is included.
- The localhost bridge can read and mutate conversations for the signed-in user; never expose it over a public network or tunnel without a separate authentication and authorization design.
- The sidebar conversation list is not a complete account export; it includes only currently loaded sidebar chats.
- UI-driven messages return after the browser response completes; this is not true token-by-token streaming.
- A timeout could happen after a chat was already submitted; always inspect Chrome before resending.
- The controller does not package a Chromium/Chrome browser and depends on the user's installed Chrome.
- A service already running on port 8791 might belong to another session. The app reports this as an external service rather than silently changing it.

## Tests

- `bun run check` and `bun run build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- Compiled Bun sidecar independently answered `GET /health` with HTTP 200 on a test port.
- Actual native macOS window and Svelte browser-preview screens visually inspected.
- Impeccable detector found no specified anti-patterns.
- Live ChatGPT conversation creation and follow-up were previously verified through the upstream controller; this new dedicated browser profile needs interactive sign-in for user-specific E2E tests.

## Included example

`samples/relay` contains the full existing Tauri/Svelte/Rust Relay chat client project. Run:

```bash
cd samples/relay
bun install
bun run tauri dev
```

Relay's Rust backend reads the same local key file and calls the controller on port 8791. It does not share or copy browser session credentials.
