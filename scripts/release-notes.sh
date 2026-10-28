#!/usr/bin/env bash
set -euo pipefail
tag="${1:?Release tag required}"
cat <<EOF
## ChatGPT Controller ${tag}

Native macOS Apple Silicon (ARM64) desktop control center for a user-controlled, signed-in ChatGPT browser. The app provides a private, authenticated localhost HTTP API.

### Install
```bash
brew install --cask aungmyokyaw/tap/chatgpt-controller
```

Homebrew availability follows the tap update. Alternatively, download the ARM64 ZIP and move **ChatGPT Controller.app** into Applications.

### Requirements
- Apple Silicon Mac, Google Chrome and Playwright CLI (`bun add -g @playwright/cli`).
- Sign in yourself using the dedicated Chrome session; the app does not collect ChatGPT credentials.
- The API binds to `127.0.0.1:8791` and requires a separate locally generated bridge key.

### Distribution notes
- The application and controller sidecar are ad-hoc signed, **not** Developer ID signed or notarized.
- macOS may require first-run approval in System Settings > Privacy & Security.
- Verify the release ZIP against the attached `SHA256SUMS`.
- Independent, unofficial browser automation project; not an OpenAI product or official OpenAI API.
- Licensed under AGPL-3.0-or-later.
EOF
