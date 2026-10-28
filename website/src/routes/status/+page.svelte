<script lang="ts">
  import { ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, Download } from "@lucide/svelte";
  import { url, baseUrl, releaseUrl } from "$lib/site";
</script>
<svelte:head>
  <title>Release status · ChatGPT Controller</title>
  <meta name="description" content="Published release and distribution status for the independent ChatGPT Controller macOS utility." />
  <link rel="canonical" href={baseUrl + "/status/"} />
</svelte:head>
<div class="constrained">
  <section class="content-hero"><h1>Release status.</h1><p class="lede">The latest documented public release and the limits of the current build.</p></section>
  <div class="info-strip" style="margin-bottom:40px">
    <strong><CheckCircle2 size={18} style="display:inline;vertical-align:middle;margin-right:8px;color:var(--teal)"/> v0.2.0 published · October 29, 2026</strong>
    <p>GitHub repository is public. The macOS ARM64 ZIP and SHA-256 checksums are published, and the verified Homebrew cask is available.</p>
  </div>
  <div class="detail"><h3><CheckCircle2 size={20} style="color:var(--teal);display:inline;vertical-align:middle;margin-right:9px"/>Available now</h3><p>Native desktop app, dedicated Chrome login, process controls, an authenticated localhost HTTP API, conversation operations, and Homebrew installation for Apple Silicon.</p></div>
  <div class="detail"><h3><Download size={20} style="color:var(--teal);display:inline;vertical-align:middle;margin-right:9px"/>Distribution</h3><p>Version 0.2.0 is published on GitHub as <code>ChatGPT-Controller-v0.2.0-macos-arm64.zip</code> alongside <code>SHA256SUMS</code>. Install using the Homebrew tap or download the archive.</p></div>
  <div class="detail"><h3><CircleAlert size={20} style="color:#b88135;display:inline;vertical-align:middle;margin-right:9px"/>Known constraints</h3><p>Requires Chrome and Playwright CLI. Only Apple Silicon is packaged. The build is ad-hoc signed, not notarized. Its HTTP controller is now native Rust, reducing the download to about 2.8 MB. Browser changes may affect automation; this is not the official OpenAI API.</p></div>
  <div style="display:flex;gap:13px;flex-wrap:wrap;padding:36px 0 90px">
    <a href={url("/download/")} class="button button-primary">Install for macOS <ArrowRight size={16}/></a>
    <a href={releaseUrl} class="button button-outline" target="_blank" rel="noopener noreferrer">View GitHub Release <ArrowUpRight size={16}/></a>
  </div>
</div>
