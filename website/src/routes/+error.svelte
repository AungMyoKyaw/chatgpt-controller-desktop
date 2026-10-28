<script lang="ts">
  import { page } from "$app/state";
  import { url } from "$lib/site";
</script>

<svelte:head><title>Page not found · ChatGPT Controller</title></svelte:head>
<section class="section constrained empty-state">
  <p class="eyebrow">Route not found</p>
  <h1>There’s nothing at this address.</h1>
  <p>Try the homepage or explore the developer documentation.</p>
  <a class="button button-primary" href={url("/")}>Return home</a>
</section>
