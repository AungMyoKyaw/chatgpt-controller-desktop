# Quick start

ChatGPT Controller gives a local script access to a **browser-backed HTTP interface** for a ChatGPT session you sign into yourself.

> This is an independent browser automation tool, **not** the official OpenAI API. Source and the v0.1.0 ARM64 release are public.

## What you need

- macOS on Apple Silicon (ARM64).
- Google Chrome.
- Playwright CLI installed locally.
- Your own ChatGPT account and access to the desktop application.

Install the application with Homebrew:

```bash
brew install --cask AungMyoKyaw/homebrew-tap/chatgpt-controller
```

Then install Playwright CLI separately (`bun add -g @playwright/cli`). For alternative downloads and build prerequisites, see the [installation guide](../installation/).

## Connect in three steps

1. In the desktop application, open **Getting started** and click **Open ChatGPT login**.
2. Sign in directly inside the dedicated Chrome window. Never enter credentials into the controller application.
3. Click **Start controller**, then go to **API access** to reveal/copy the controller key and localhost endpoint.

The controller listens on `127.0.0.1:8791` and requires the header `X-Bridge-Key` on all endpoints except `GET /health`.

## First request

Run this on the same Mac while your browser is connected and your controller is running:

```bash
curl 'http://127.0.0.1:8791/v1/conversations?limit=5' \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)"
```

The conversation list reflects **currently loaded sidebar conversations**, not a guaranteed full account export.

## Send a message

This request sends a real prompt to your signed-in ChatGPT browser:

```bash
curl -X POST http://127.0.0.1:8791/v1/chat \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)" \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"Explain Kubernetes networking in three steps."}'
```

A successful response includes `reply` and `conversation_path`. To continue the same thread, send another `POST /v1/chat` with the exact returned `conversation_path` and your next prompt.

## Where to go next

- [API reference](../api-reference/) — operations, examples, and HTTP errors.
- [Privacy and security](../security/) — localhost boundaries and account/session handling.
- [Troubleshooting](../troubleshooting/) — browser, authentication, and process failures.
