# Native WebKit Migration — Development Branch

## Current implementation

- The Tauri macOS application now hosts its Axum localhost server in-process, with no runtime Rust sidecar.
- An isolated WKWebView loads the real https://chatgpt.com login page using macOS WebKit. It is created lazily on login or controller startup, not while the main UI initially loads. The user signs in there; the application does not collect passwords.
- The backend uses an authenticated WebKit JavaScript evaluation bridge with native callbacks. It does not enable remote-site Tauri IPC privileges.
- Native Rust HTTP is available as an opt-in experiment (`CHATGPT_CONTROLLER_ENABLE_NATIVE_HTTP=1`) for listing, message retrieval, rename, archive and delete; the reliable same-origin WebKit path is the default. The access token is retrieved from the authenticated WebKit session, stored only in memory for 30 seconds, and never returned to localhost callers. HTTP authentication failures temporarily disable native mode; operations then fall back to in-WebKit requests.
- Conversation status is checked with authenticated same-origin browser iframe requests. The new monitoring read lane does not hold the global chat/UI busy lock.
- Chat send and conversation-open use WebKit navigation and DOM operations. These UI-dependent flows need live ChatGPT website validation; browser selectors can change.
- The localhost interface remains bound to 127.0.0.1:8791 with X-Bridge-Key. The preexisting key file is reused; requests from external hosts are rejected.
- The Tauri distribution no longer bundles the independent native controller process and requires neither external Chrome nor Playwright CLI. Bun remains a source-build tool only.

## Qualification completed

- Rust workspace cargo check and Tauri unit tests.
- Native controller unit tests.
- Svelte type checking, zero errors/warnings.
- Deterministic browser-script tests for discovery, message retrieval, archive and authentication failure.
- JavaScript syntax validation for all WebKit script templates.

## Live local qualification (2026-10-29)

- Native macOS `.app` launched, and its accessibility tree exposed the Svelte interface.
- The app reported an authenticated WebKit session in one run.
- Clicking **Start controller** started the in-process Axum listener; `GET /health` returned HTTP 200.
- Authenticated `GET /v1/conversations?limit=5` returned HTTP 200, **scope `loaded-sidebar-only`** rather than account-wide discovery.
- Authenticated message read returned HTTP 502 (`WebKit action failed`). A known conversation status returned `unavailable` with `browser_status_unavailable`. A three-ID batch returned the expected batch envelope but not verified upstream statuses.
- Therefore full API compatibility and status monitoring are **not qualified** yet, despite the passing compiler and deterministic unit tests.
- The release candidate is for local diagnostics only; it has not been pushed or published.

## Remaining release blockers

- Verify sign-in for email, Google, Apple, Microsoft and supported SSO through actual embedded WebKit on the intended macOS release build. Provider restrictions may prevent some flows; this is not proven to work universally.
- Verify real new-chat/follow-up message sending, output extraction and generation completion against the currently deployed ChatGPT UI. The DOM fallback has not been verified on a signed-in real account.
- Run a successful Vite production build and generate a signed macOS .app. Confirm the package starts and the localhost controller works after an app restart.
- Benchmark the complete system on a logged-in account against the previous Chrome/Playwright release, including 50-ID status checks and concurrent generation.
- Verify the native HTTP path works on real account traffic; the fallback is expected to handle unsupported website authentication conditions.

Do not publish this as a fully compatible drop-in migration until those gates pass. The embedded login architecture is experimental until live validation succeeds.

## Source modules

- src-tauri/src/webkit.rs: WKWebView lifecycle, JavaScript execution, callbacks and login window.
- src-tauri/src/lib.rs: Tauri commands and in-process Axum startup/shutdown.
- native-controller/src/browser.rs: WebKit execution channel and source-compatible result mapping.
- native-controller/src/transport.rs: bounded authenticated native HTTP fast path and fallback.
- native-controller/src/api.rs: compatible localhost API and independent monitoring lane.
- native-controller/webkit-scripts.json: browser-context operations.
- tests/webkit-scripts.test.mjs: deterministic script contract tests.

The project remains unofficial; its ChatGPT website endpoints are not the official OpenAI API.
