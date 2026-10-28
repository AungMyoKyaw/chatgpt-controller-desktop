<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Menu, X, Moon, Sun, ArrowUpRight } from "@lucide/svelte";
  import { nav, repo, url, baseUrl } from "$lib/site";
  let { children } = $props();
  let theme = $state<"light" | "dark">("light");
  let menuOpen = $state(false);

  onMount(() => {
    theme = localStorage.getItem("controller-site-theme") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  });

  function toggleTheme() {
    theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("controller-site-theme", theme);
  }
  const current = $derived(page.url.pathname);
</script>

<svelte:head>
  <meta name="description" content="ChatGPT Controller is an independent, local-first macOS utility that connects a signed-in ChatGPT browser to a private localhost API. In development." />
  <meta property="og:site_name" content="ChatGPT Controller" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content={`${baseUrl}/images/getting-started-connected.jpg`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="robots" content="index,follow" />
</svelte:head>

<a class="skip-link" href="#main" style="position:absolute;left:-9999px;top:8px;background:var(--paper);color:var(--ink);padding:10px;z-index:200" onfocus={(e) => (e.currentTarget.style.left = "12px")} onblur={(e) => (e.currentTarget.style.left = "-9999px")}>Skip to content</a>
<header class="header">
  <div class="container header-inner">
    <a href={url("/")} class="brand" aria-label="ChatGPT Controller home" onclick={() => (menuOpen = false)}>
      <img src={url("/controller-icon.svg")} width="33" height="33" alt="" />
      <span>ChatGPT Controller</span>
    </a>
    <nav class="nav" aria-label="Main navigation">
      {#each nav as item}
        <a href={url(item.href)} aria-current={current.startsWith(url(item.href)) ? "page" : undefined}>{item.title}</a>
      {/each}
    </nav>
    <div class="header-actions">
      <button class="icon-btn" type="button" onclick={toggleTheme} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={theme === "light" ? "Dark mode" : "Light mode"}>
        {#if theme === "light"}<Moon size={18} />{:else}<Sun size={18} />{/if}
      </button>
      <a class="button button-primary button-small" href={url("/status/")}>Release status <ArrowUpRight size={15}/></a>
      <button class="icon-btn mobile-menu-btn" type="button" aria-expanded={menuOpen} aria-controls="mobile-nav" aria-label={menuOpen ? "Close menu" : "Open menu"} onclick={() => (menuOpen = !menuOpen)}>
        {#if menuOpen}<X size={19}/>{:else}<Menu size={19}/>{/if}
      </button>
    </div>
  </div>
  {#if menuOpen}
    <nav id="mobile-nav" class="mobile-menu" aria-label="Mobile navigation">
      {#each nav as item}
        <a href={url(item.href)} onclick={() => (menuOpen = false)}>{item.title}</a>
      {/each}
      <a href={url("/status/")} onclick={() => (menuOpen = false)}>Release status</a>
    </nav>
  {/if}
</header>
<main id="main">
  {@render children()}
</main>
<footer class="site-footer">
  <div class="container">
    <div class="footer-top">
      <div>
        <a class="brand" href={url("/")}><img src={url("/controller-icon.svg")} alt="" width="33" height="33" /> ChatGPT Controller</a>
        <p>Private, local-first browser automation for developers. Independent software, not affiliated with or endorsed by OpenAI.</p>
      </div>
      <div class="footer-links">
        <a href={url("/features/")}>Features</a>
        <a href={url("/how-it-works/")}>How it works</a>
        <a href={url("/docs/v1/quick-start/")}>Documentation</a>
        <a href={url("/faq/")}>FAQ</a>
        <a href={url("/download/")}>Download</a>
        <a href={url("/status/")}>Release status</a>
        <a href={repo} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© {new Date().getFullYear()} ChatGPT Controller · AGPL-3.0-or-later</span>
      <span>Built for macOS Apple Silicon · No official OpenAI API integration</span>
    </div>
  </div>
</footer>
