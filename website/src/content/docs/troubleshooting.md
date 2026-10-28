# Troubleshooting

Most connectivity problems are caused by a missing dependency, an incomplete login, or a localhost process that is not running.

## Browser does not launch

Verify that Chrome and Playwright CLI are installed:

```bash
playwright-cli --help
```

Open the **Getting started** page and run the app's dependency checks. The current app expects Playwright CLI to be installed separately.

## Controller is offline

Start the controller from the native app. Check whether port `127.0.0.1:8791` is already occupied. The desktop app intentionally avoids stopping a controller process it does not own.

Health probe:

```bash
curl --fail-with-body http://127.0.0.1:8791/health
```

## Authentication error (401)

Sign in to ChatGPT in the **dedicated Chrome profile**, not just your everyday browser profile. Confirm the correct `X-Bridge-Key` from the desktop app.

## No conversations listed

Conversation discovery depends on **loaded sidebar conversations**. Listing zero conversations does not prove your account is empty.

## Status is unknown

An unknown status means the controller could not conclusively inspect the conversation in an already-open browser tab. It does not mean completed.

## Too many requests (429)

The controller performs one browser operation at a time. Wait for the in-flight operation to finish before submitting a new one.

## Timeouts (504)

Inspect Chrome **before repeating** a request. A timeout may occur even if the original prompt was submitted.

## GitHub Pages website is not live

For the marketing website, GitHub Pages is expected only after public release readiness and enabling **Settings → Pages → Source: GitHub Actions**. The repository is private during preparation, and GitHub Free does not publish Pages from private repositories.
