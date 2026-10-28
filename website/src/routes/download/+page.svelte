<script lang="ts">
  import { ArrowRight, ArrowUpRight, CircleAlert, Laptop2 } from "@lucide/svelte";
  import { repo, url, baseUrl } from "$lib/site";
</script>
<svelte:head>
  <title>Download · ChatGPT Controller</title>
  <meta name="description" content="Check distribution status, macOS requirements, and source-build instructions for ChatGPT Controller." />
  <link rel="canonical" href={baseUrl + "/download/"} />
</svelte:head>
<div class="constrained">
  <section class="content-hero"><h1>Built for your Mac.</h1><p class="lede">A macOS Apple Silicon desktop utility with a browser-backed local API. Public release files are not yet verified.</p></section>
  <div class="info-strip" style="margin-bottom:31px"><strong><span class="dot" style="display:inline-block;margin-right:8px;background:#b88135"></span> Distribution status: pre-release</strong><p>No published downloadable GitHub Release is currently verified. We are not presenting the local maintainer build as a public download.</p></div>
  <h2 style="font-size:1.8rem;margin-top:40px">Requirements</h2>
  <div class="detail"><h3>macOS Apple Silicon</h3><p>The documented build target is ARM64. Intel macOS, Windows and Linux are not supported release targets.</p></div>
  <div class="detail"><h3>Google Chrome</h3><p>The controller opens a dedicated Chrome profile for user-controlled sign-in.</p></div>
  <div class="detail"><h3>Playwright CLI</h3><p>The browser-driving dependency is not bundled in the current release candidate.</p></div>
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin:38px 0 88px"><a href={url("/status/")} class="button button-primary">Follow release status <ArrowRight size={16}/></a><a href={url("/docs/v1/installation/")} class="button button-outline">Source build guide <ArrowUpRight size={16}/></a></div>
</div>
