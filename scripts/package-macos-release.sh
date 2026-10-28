#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(node -p "require('./package.json').version")"
APP_NAME="ChatGPT Controller.app"
APP="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/${APP_NAME}"
if [[ ! -d "$APP" ]]; then APP="src-tauri/target/release/bundle/macos/${APP_NAME}"; fi
[[ -d "$APP" ]] || { echo "Missing Tauri application bundle" >&2; exit 1; }
MAIN="$APP/Contents/MacOS/chatgpt-controller-desktop"
SIDECAR="$APP/Contents/Resources/bin/controller"
[[ -f "$MAIN" && -x "$MAIN" ]] || { echo "Missing main executable" >&2; exit 1; }
[[ -f "$SIDECAR" && -x "$SIDECAR" ]] || { echo "Missing bundled controller sidecar" >&2; exit 1; }
file "$MAIN" "$SIDECAR"
file "$MAIN" | grep -q arm64 || { echo "Main executable must be ARM64" >&2; exit 1; }
file "$SIDECAR" | grep -q arm64 || { echo "Sidecar must be ARM64" >&2; exit 1; }
# Ad-hoc signature; Developer ID and notarization are not configured.
codesign --force --sign - --timestamp=none "$SIDECAR"
codesign --force --deep --sign - --timestamp=none "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
mkdir -p dist
ASSET="ChatGPT-Controller-v${VERSION}-macos-arm64.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "dist/$ASSET"
(cd dist && shasum -a 256 "$ASSET" > SHA256SUMS && shasum -a 256 -c SHA256SUMS)
echo "Created dist/$ASSET"
