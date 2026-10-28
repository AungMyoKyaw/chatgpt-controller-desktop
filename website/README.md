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
- Also listens for GitHub's **public** event when the repository switches from private to public.
- Does **not** change repository visibility or publish ChatGPT credentials.
- Requires **Settings → Pages → Build and deployment → Source → GitHub Actions**. Depending on GitHub plan, this option may not be available while the repository is private. If Pages is disabled when the repo goes public, enable GitHub Actions as the Pages source, then re-run the workflow from Actions → Website · checks and GitHub Pages (or push a website change). Visibility change alone does not guarantee that GitHub initializes Pages.
- Target URL after deployment: `https://aungmyokyaw.github.io/chatgpt-controller-desktop/`.

If adding a custom domain later, update `SITE_BASE_PATH` to an empty string and the canonical URL in `src/lib/site.ts`, then configure DNS and Pages' Custom domain setting.

## Content

- Routes: home, features, how it works, docs v1, FAQ, status, download, doc search.
- Versioned docs are Git-managed Markdown under `src/content/docs`.
- `scripts/build-search.mjs` creates a privacy-friendly static search index from those Markdown files. Search never needs a backend.
- Screenshots are derived from the original app at `../docs/screenshots`, optimized for web delivery.
- `design/concepts.md` records the three design directions and the selected one.
- No fake ratings, customers, release download, or product claims.
- Do not embed the local controller key, browser cookies, tokens, or credentials in the public site.

### Release switch

Before adding a download CTA, verify a published GitHub Release and its public URL. Until then, keep the website status as pre-release. The GitHub source repository is not yet public.

### Status updating

Update the release-status route and docs together when features and distribution state change. Verify against `../README.md`, `../PRODUCT.md`, `../docs/API.md` and `../docs/conversation-status-api.md` before publishing.
