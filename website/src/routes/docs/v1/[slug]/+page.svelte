<script lang="ts">
  import { page } from "$app/state";
  import { docsPages, url, baseUrl } from "$lib/site";
  let { data } = $props();
</script>
<svelte:head>
  <title>{data.doc.label} · ChatGPT Controller Docs v1</title>
  <meta name="description" content={`ChatGPT Controller v1: ${data.doc.label}. Documentation for the independent local-first macOS browser controller.`} />
  <link rel="canonical" href={baseUrl + "/docs/v1/" + data.doc.slug + "/"} />
</svelte:head>
<div class="container docs-shell">
  <aside class="docs-sidebar" aria-label="Documentation navigation">
    <a href={url("/docs/v1/quick-start/")} style="font-weight:800;text-decoration:none;font-size:1rem">Documentation <span style="font-size:.7rem;color:var(--muted)">v1</span></a>
    <div style="margin:18px 0"><a href={url("/docs/v1/search/")} style="display:block;background:var(--paper);border:1px solid var(--line);border-radius:7px;padding:11px 12px">Search documentation ↗</a></div>
    <h2>Get started</h2>
    <nav aria-label="Get started">
      {#each docsPages.filter((p) => p.category === "Get started") as item}
        <a href={url(`/docs/v1/${item.slug}/`)} aria-current={page.url.pathname === url(`/docs/v1/${item.slug}/`) ? "page" : undefined}>{item.label}</a>
      {/each}
    </nav>
    <h2>Reference</h2>
    <nav aria-label="Reference">
      {#each docsPages.filter((p) => p.category === "Reference") as item}
        <a href={url(`/docs/v1/${item.slug}/`)} aria-current={page.url.pathname === url(`/docs/v1/${item.slug}/`) ? "page" : undefined}>{item.label}</a>
      {/each}
    </nav>
  </aside>
  <div class="docs-article" data-pagefind-body>
    <p style="font-size:.75rem;color:var(--teal);font-weight:800;letter-spacing:.05em">API DOCUMENTATION / V1</p>
    <div class="markdown">{@html data.doc.html}</div>
  </div>
</div>
