# ChatGPT Controller — product website

Public marketing and versioned developer documentation for the existing native desktop controller. The website is isolated inside `website/` and does not change the desktop application or its dependencies.

## Development

```bash
cd website
bun install
bun run dev
```

```bash
bun run check
bun run build
bun run test:smoke
```

## GitHub Pages

Repository: `AungMyoKyaw/chatgpt-controller-desktop`, default branch `master`.

Build the site exactly as Pages will:

```bash
cd website
SITE_BASE_PATH=/chatgpt-controller-desktop bun run build
bun run test:smoke
```

Workflow: `../.github/workflows/website-pages.yml`.

- Builds and checks on relevant PRs and pushes to `master`.
- Uploads/deploys **only when the repository is public**, never from a pull request.
- Also supports rebuilding after a repository visibility change; the repository is now public.
- Does **not** change repository visibility or publish ChatGPT credentials.
- GitHub Pages is enabled with **Settings → Pages → Build and deployment → Source → GitHub Actions**. If deployment fails, inspect Actions → Website · checks and GitHub Pages, then re-run the failed workflow.
- Live URL: `https://aungmyokyaw.github.io/chatgpt-controller-desktop/`.

If adding a custom domain later, update `SITE_BASE_PATH` to an empty string and the canonical URL in `src/lib/site.ts`, then configure DNS and Pages' Custom domain setting.

## Content

- Routes: home, features, how it works, docs v1, FAQ, status, download, doc search.
- Versioned docs are Git-managed Markdown under `src/content/docs`.
- `scripts/build-search.mjs` creates a privacy-friendly static search index from those Markdown files. Search never needs a backend.
- Screenshots are derived from the original app at `../docs/screenshots`, optimized for web delivery.
- `design/concepts.md` records the three design directions and the selected one.
- No fake ratings, customers, or product claims; download links must target verified published release assets.
- Do not embed the local controller key, browser cookies, tokens, or credentials in the public site.

### Release switch

The repository is public, and the v0.2.0 release is published. The website links to the verified GitHub release and offers the Homebrew cask command `brew install --cask AungMyoKyaw/homebrew-tap/chatgpt-controller`. Keep future release links and status synchronized with published GitHub release assets.

### Status updating

Update the release-status route and docs together when features and distribution state change. Verify against `../README.md`, `../PRODUCT.md`, `../docs/API.md` and `../docs/conversation-status-api.md` before publishing.
