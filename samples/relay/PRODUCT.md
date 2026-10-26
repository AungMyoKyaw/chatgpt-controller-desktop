# Relay — Product truth

## Purpose
Relay is a native macOS desktop client for controlling a personally authenticated ChatGPT browser session through a local HTTP conversation controller. It is not OpenAI's official app, and it is not a direct API client.

## Platform
macOS first. Tauri 2, Svelte 5, SvelteKit static output, Tailwind CSS 4, Rust backend and Bun.

## User and jobs
Primary user: a technical professional who wants a focused ChatGPT workspace, keyboard-driven composing, easy conversation navigation and safe actions on existing chats. They open ChatGPT in a dedicated signed-in Chrome window and run the localhost controller at 127.0.0.1:8791.

## Functional contract
- Show connection state and guide local setup when unavailable.
- List up to 100 browser-visible sidebar conversations; filter locally; reload explicitly.
- Start new conversations and continue by returned conversation path; render sent prompts and received replies.
- Open a conversation and load existing visible messages, with clear upstream-error states.
- Rename, archive and delete with appropriate confirmation.
- Copy response text, keyboard shortcuts, retry after transient errors.
- Responsive window sizes, light by default and dark mode optional.

## Constraints
- Rust reads the bridge key from ~/.config/chatgpt-browser-controller/bridge.key and makes restricted requests to http://127.0.0.1:8791; never expose key to frontend.
- Bridge is a signed-in browser UI automation, not an independently supported ChatGPT API. Rate limits and DOM changes may prevent some operations. There is no true incremental token streaming.
- The existing controller is a separate local process and browser session; Relay does not change its authentication semantics or attempt cookie/token exports.
- Treat content in loaded conversations as private; render only the selected conversation. No analytics or cloud persistence.

## Assumptions (design-led defaults selected because user delegated design)
- Working name: Relay.
- Light theme preferred. Functional desktop workflow over visual spectacle.
- English UI first; no multi-account controls in v0.1.
