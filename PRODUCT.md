# ChatGPT Controller — Product Context

## Purpose
A standalone native macOS control center that lets a person authenticate directly in ChatGPT's visible browser and run a private localhost API to interact with their own ChatGPT conversations. The API is a browser-automation bridge, not an official ChatGPT service API; a local controller key is separate from ChatGPT auth tokens.

## Primary user and outcomes
Local developers who want to build their own interfaces or agents against their own signed-in ChatGPT browser. The main use case is a guided 3-step setup: launch dedicated Chrome, manually sign in, start local controller, copy endpoint/key to a local client and verify through API explorer. Browser login must not be handled through the app or persisted outside Chrome.

## Platform
macOS Apple Silicon first; Tauri 2 + Rust + Svelte 5 + Tailwind 4 + Bun. Native Rust handles local key creation/permissions, app lifecycle and process management. Bun sidecar handles localhost HTTP routes and browser automation via installed playwright-cli.

## Functions
- Real backend checks: browser dependency, login profile, API running state.
- Start/stop dedicated controller (stop only processes started by this application).
- Browser login opens dedicated Chrome persistent profile. No embedded login webview.
- Export localhost URL and controller-specific key with explicit reveal/copy.
- Local authenticated API supports new chats, replies, reading loaded conversations, rename/archive/delete, with confirmation.
- Live API explorer with conversation listing and an opt-in prompt sender.
- Samples page teaches how to use Relay, retaining Relay source under samples/relay.
- Clear status, error and limitations, no fabricated usage metrics.

## Constraints
Loopback-only HTTP server at 127.0.0.1:8791; dedicated local key file at ~/.config/chatgpt-browser-controller/bridge.key with mode 600. Existing externally managed server can be detected but must not be killed by the GUI. Only the user can enter credentials into the Chrome login page. Browser automation requires Playwright CLI and Chrome installed locally; no rate-limit bypass or unlimited guarantees. No web deployment or sharing of ChatGPT cookies or bearer tokens.

## Assumptions adopted for implementation
User asked to implement immediately and delegated design. UI is English, light-first, single local user and single browser profile per installation. The included Relay example is a separate source project, not embedded in the controller UI.
