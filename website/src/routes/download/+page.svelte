<script lang="ts">
  import { ArrowRight, ArrowUpRight, CheckCircle2, Copy, Download } from "@lucide/svelte";
  import { baseUrl, brewInstall, releaseUrl, url } from "$lib/site";

  let copied = $state(false);
  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(brewInstall);
      copied = true;
      window.setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<svelte:head>
  <title>Download · ChatGPT Controller</title>
  <meta name="description" content="Install ChatGPT Controller v0.2.0 with Homebrew or download the verified macOS Apple Silicon release." />
  <link rel="canonical" href={baseUrl + "/download/"} />
</svelte:head>

<div class="constrained">
  <section class="content-hero">
    <p class="eyebrow">v0.2.0 · macOS Apple Silicon</p>
    <h1>Install ChatGPT Controller.</h1>
    <p class="lede">A native control center for a ChatGPT browser you sign into yourself. Install the app with Homebrew or download the published release.</p>
  </section>

  <div class="info-strip" style="margin-bottom:31px">
    <strong><CheckCircle2 size={18} style="display:inline;vertical-align:middle;margin-right:8px;color:var(--teal)"/> Public release available</strong>
    <p>Version 0.2.0 is published on GitHub and distributed through the AungMyoKyaw Homebrew tap. ARM64 only; no notarization. The Rust-based release download is about 2.8 MB.</p>
  </div>

  <h2 style="font-size:1.8rem;margin-top:38px">Install with Homebrew</h2>
  <p>The recommended method. Homebrew verifies the exact release checksum before installing the app.</p>
  <div class="install-command install-command-large">
    <code>{brewInstall}</code>
    <button type="button" onclick={copyInstall} aria-label="Copy Homebrew install command"><Copy size={16}/>{copied ? "Copied ✓" : "Copy"}</button>
  </div>
  <p class="muted" style="margin-top:16px">Already installed? Update with <code>brew upgrade --cask AungMyoKyaw/homebrew-tap/chatgpt-controller</code>.</p>

  <h2 style="font-size:1.8rem;margin-top:45px">Direct download</h2>
  <p>Prefer not to use Homebrew? Download the ARM64 ZIP and the SHA-256 checksums from GitHub. Extract and move <strong>ChatGPT Controller.app</strong> to Applications.</p>
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin:24px 0 42px">
    <a class="button button-primary" href={releaseUrl} target="_blank" rel="noopener noreferrer"><Download size={16}/> GitHub Release v0.2.0 <ArrowUpRight size={16}/></a>
    <a class="button button-outline" href={url("/docs/v1/installation/")}>Installation guide <ArrowRight size={16}/></a>
  </div>

  <h2 style="font-size:1.8rem;margin-top:45px">Requirements</h2>
  <div class="detail"><h3>Apple Silicon Mac</h3><p>The release archive targets ARM64. Intel macOS, Windows, and Linux packages are not provided.</p></div>
  <div class="detail"><h3>Google Chrome</h3><p>Install Chrome locally. The controller opens a dedicated visible browser profile for you to sign in.</p></div>
  <div class="detail"><h3>Playwright CLI</h3><p>Version 0.2.0 requires Playwright CLI separately. Install it with <code>bun add -g @playwright/cli</code> and check <code>playwright-cli --help</code>.</p></div>
  <div class="detail"><h3>macOS signing</h3><p>The app uses ad-hoc signing, not Apple Developer ID signing or notarization. Homebrew tries to remove quarantine recursively from the installed app during postflight. For a direct download, or if macOS still blocks launch, use System Settings → Privacy &amp; Security.</p></div>
  <p style="margin:36px 0 90px" class="muted">Independent, unofficial browser automation software. Not an OpenAI product or the official OpenAI API.</p>
</div>
