# Privacy & security

ChatGPT Controller is a local browser automation bridge built for users operating their own signed-in browser session.

## Trust boundaries

**Local Mac → Controller → Visible Chrome profile → ChatGPT website.**

- The HTTP server binds to **127.0.0.1:8791**, not a public interface.
- Clients authenticate using a **separate controller key**, not a ChatGPT bearer token.
- The locally generated key is stored in `~/.config/chatgpt-browser-controller/bridge.key` with owner-only file permissions.
- Sign-in happens in a dedicated **visible Chrome window**. You enter credentials directly on ChatGPT's site.
- The application does **not** export ChatGPT cookies, session bearer tokens or account passwords.
- The UI only stops processes **launched and owned by the application**.

## Safe operation

Treat your local `X-Bridge-Key` like a secret. Do not paste it into GitHub Issues, screenshots, bug reports, public JavaScript, or frontend bundles.

Use the controller key only from local trusted clients. Do not expose the localhost endpoint through a public reverse proxy. Browser state and account access remain subject to ChatGPT's normal protections and limits.

## Limitations and scope

This project is not an OpenAI product, is not affiliated with or endorsed by OpenAI, and is **not the official OpenAI API**.

The bridge depends on locally installed Chrome and Playwright CLI. The browser UI may change; not all account conversations are necessarily loaded; and completion status is based on local observations. It makes no claims of unlimited or guaranteed availability.

## Website security

This website is a static marketing and documentation site. It does not connect to the controller running on your Mac, collect your local key, or proxy ChatGPT requests.
