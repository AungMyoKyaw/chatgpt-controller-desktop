# ChatGPT Controller — GitHub Actions release process

The project ships an Apple Silicon macOS application through GitHub Releases and
the [Homebrew tap](https://github.com/AungMyoKyaw/homebrew-tap).

## Workflows

- `.github/workflows/ci.yml`: run on pull requests and master pushes. Check
  release metadata, Svelte/TypeScript, the controller's 30 unit tests, release
  tooling, frontend build, Rust formatting, and Rust tests.
- `.github/workflows/release.yml`: run on pushed `vX.Y.Z` tags. Also supports
  a **manual build-only** run from Actions (does not publish). The workflow
  validates source; compiles the Tauri and Bun sidecar natively on a macOS ARM64
  runner; ad-hoc signs the app and sidecar; verifies the bundle; creates a ZIP
  and `SHA256SUMS`; uploads a build artifact; and publishes a GitHub Release.
- The release job makes a **draft** first and publishes it only after uploading
  verified assets. The repository **must be public** before publishing a tagged
  release: the Homebrew download URL cannot work for private GitHub Releases.
- After publishing, the controller workflow can update the Homebrew cask immediately
  with a scoped token. Independently, the **public Homebrew tap** has a scheduled
  GitHub Action (`chatgpt-controller-sync.yml`) that checks for the latest public
  release every two hours and updates the exact SHA-256 pin using its own token.
  This fallback requires **no cross-repository credential**.

## Initial setup

1. Perform the public-source and Git-history secret review before making the
   controller repository public.
2. Make `AungMyoKyaw/chatgpt-controller-desktop` public when approved.
3. For **immediate** tap updates, optionally add controller repository Actions
   secret `HOMEBREW_TAP_TOKEN`: a **fine-grained GitHub token** with Contents:
   Read and Write for **only** `AungMyoKyaw/homebrew-tap`. Without this secret,
   the public tap's scheduled sync will pick up the release (normally within
   two hours, subject to GitHub Actions scheduling). Never commit a token.
4. Confirm Actions are enabled and can publish releases through the workflow's
   job-scoped `contents: write` permission.

## Release

Run the CI workflow on `master` first. Bump the same SemVer in:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml` (and update `Cargo.lock` if needed)

Check locally:

```bash
bun install --frozen-lockfile
bun run check
bun test controller
node --test tests/release-scripts.test.mjs
node scripts/verify-release-version.mjs v0.1.0
actionlint .github/workflows/ci.yml .github/workflows/release.yml
```

Create and push the annotated release tag **only after the matching commit is
on master**:

```bash
git tag -a v0.1.0 -m "ChatGPT Controller v0.1.0"
git push origin v0.1.0
```

Follow the run on GitHub Actions and confirm:

- `ChatGPT-Controller-v0.1.0-macos-arm64.zip` exists in the public release.
- `SHA256SUMS` matches the downloaded ZIP.
- The generated Homebrew cask references that tag and exact hash.
- `brew audit --cask aungmyokyaw/tap/chatgpt-controller`, and an actual
  install, launch, uninstall, and upgrade test succeed on an Apple Silicon Mac.

For a pre-release CI test, run `macOS ARM64 Release` using **Run workflow** on
`master`; the manual workflow builds and uploads the package as a private
Actions artifact but does not create a GitHub Release.

## Runtime / security

The current app uses an isolated Chrome profile and a localhost key. Google
Chrome and the `@playwright/cli` command are **external requirements** in
v0.1.0. No user session or credential is packaged into the release.

The ZIP is ad-hoc signed, not Apple Developer ID signed or notarized. Cask
installation does not remove quarantine automatically. Users may need to
approve the app through macOS Privacy & Security.

## Failure and retry

A failed validation/build job never publishes a release. If a release is
already published and the tap update fails, correct the tap credentials and
rerun the failed Homebrew job, or update the cask manually using the same
release checksum. **Do not silently replace a published, versioned binary.**
If the release creation job fails after creating a draft, inspect the draft
before retrying; the workflow intentionally refuses to overwrite releases.
