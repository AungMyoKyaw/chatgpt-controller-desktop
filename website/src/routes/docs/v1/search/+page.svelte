<script lang="ts">
  import { onMount } from "svelte";
  import { docsPages, url, baseUrl } from "$lib/site";

  let query = $state("");
  let results = $state<{ title: string; href: string; excerpt: string }[]>([]);
  let index: { title: string; url: string; text: string }[] = [];
  let errorText = $state("");

  onMount(async () => {
    try {
      const response = await fetch(url("/search-index.json"));
      if (!response.ok) throw new Error("index unavailable");
      index = await response.json();
    } catch {
      errorText = "The documentation index is unavailable. You can still browse individual guides below.";
    }
  });

  function runSearch() {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    results = terms.length
      ? index
        .filter((x) => terms.every((term) => (x.title + " " + x.text).toLowerCase().includes(term)))
        .slice(0, 12)
        .map((x) => ({ title: x.title, href: url(x.url), excerpt: x.text.slice(0, 180) + "…" }))
      : [];
  }
</script>

<svelte:head>
  <title>Search documentation · ChatGPT Controller</title>
  <meta name="description" content="Search ChatGPT Controller's versioned documentation." />
  <link rel="canonical" href={baseUrl + "/docs/v1/search/"} />
</svelte:head>

<div class="constrained">
  <section class="content-hero">
    <h1>Find it in the docs.</h1>
    <p class="lede">Fast static search over the versioned documentation, without an external search service.</p>
  </section>
  <label for="docs-query" class="sr-only">Search documentation</label>
  <input id="docs-query" class="search-field" type="search" placeholder="Try “controller key”, “status”, or “installation”…" bind:value={query} oninput={runSearch} />
  {#if errorText}<p class="muted" role="status">{errorText}</p>{/if}
  {#if query.trim()}
    {#if results.length === 0}<p class="muted" style="margin:25px 0 100px">No matches. Try another search term.</p>{/if}
    <ul class="search-results" style="margin-bottom:100px">
      {#each results as result}
        <li><a href={result.href}><strong>{result.title}</strong><span>{result.excerpt}</span></a></li>
      {/each}
    </ul>
  {:else}
    <div style="margin:35px 0 100px">
      <p class="muted">Browse documentation:</p>
      <ul class="search-results">
        {#each docsPages as item}
          <li><a href={url(`/docs/v1/${item.slug}/`)}><strong>{item.label}</strong><span>{item.category}</span></a></li>
        {/each}
      </ul>
    </div>
  {/if}
</div>