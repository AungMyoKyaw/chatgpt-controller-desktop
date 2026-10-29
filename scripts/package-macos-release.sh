#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(node -p "require('./package.json').version")"
APP_NAME="ChatGPT Controller.app"
APP=""
for candidate in   "src-tauri/target/release/bundle/macos/${APP_NAME}"   "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/${APP_NAME}"; do
  [[ -d "$candidate" && -f "$candidate/Contents/Info.plist" ]] || continue
  actual_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$candidate/Contents/Info.plist" 2>/dev/null || true)"
  if [[ "$actual_version" == "$VERSION" ]]; then
    APP="$candidate"
    break
  fi
done
[[ -n "$APP" ]] || { echo "No Tauri bundle with embedded version $VERSION found; rebuild before packaging" >&2; exit 1; }
echo "Packaging $APP (embedded version $VERSION)"
MAIN="$APP/Contents/MacOS/chatgpt-controller-desktop"
[[ -f "$MAIN" && -x "$MAIN" ]] || { echo "Missing main executable" >&2; exit 1; }
file "$MAIN"
file "$MAIN" | grep -q arm64 || { echo "Main executable must be ARM64" >&2; exit 1; }
# Ad-hoc signature; Developer ID and notarization are not configured.
codesign --force --deep --sign - --timestamp=none "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
[[ -f "$APP/Contents/_CodeSignature/CodeResources" ]] || { echo "Missing resource seal after signing" >&2; exit 1; }
mkdir -p dist
ASSET="ChatGPT-Controller-v${VERSION}-macos-arm64.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "dist/$ASSET"
(cd dist && shasum -a 256 "$ASSET" > SHA256SUMS && shasum -a 256 -c SHA256SUMS)
echo "Created dist/$ASSET"
