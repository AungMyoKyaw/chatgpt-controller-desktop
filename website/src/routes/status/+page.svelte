<script lang="ts">
  import { ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, Clock3 } from "@lucide/svelte";
  import { url, repo, baseUrl } from "$lib/site";
</script>
<svelte:head>
  <title>Release status · ChatGPT Controller</title>
  <meta name="description" content="Transparent development and public distribution status for the independent ChatGPT Controller macOS project." />
  <link rel="canonical" href={baseUrl + "/status/"} />
</svelte:head>
<div class="constrained">
  <section class="content-hero"><h1>Release status, without the guesswork.</h1><p class="lede">A factual snapshot of documented capabilities and known distribution limitations. No invented launch dates.</p></section>
  <div class="info-strip" style="margin-bottom:40px"><strong>Pre-release · Last documentation review: October 28, 2026</strong><p>A local 0.1.0 macOS Apple Silicon archive exists in the maintainer workspace. The repository is private and no public GitHub Release has been verified.</p></div>
  <div class="detail"><h3><CheckCircle2 size={20} style="color:var(--teal);display:inline;vertical-align:middle;margin-right:9px"/>Implemented in current repository</h3><p>Native desktop UI, dedicated Chrome login flow, process controls, local authenticated HTTP API, in-app explorer, conversation operations and real screenshots.</p></div>
  <div class="detail"><h3><Clock3 size={20} style="color:var(--teal);display:inline;vertical-align:middle;margin-right:9px"/>Before public distribution</h3><p>Public repository availability, independently verified release assets, developer installation instructions and any required code-signing/notarization decisions.</p></div>
  <div class="detail"><h3><CircleAlert size={20} style="color:#b88135;display:inline;vertical-align:middle;margin-right:9px"/>Known constraints</h3><p>Requires Chrome and an installed Playwright CLI; browser UI changes can affect functionality. This tool uses browser automation, not an official OpenAI service API, and does not bypass subscription limits.</p></div>
  <div style="display:flex;gap:13px;flex-wrap:wrap;padding:36px 0 90px"><a href={url("/docs/v1/quick-start/")} class="button button-primary">Read the documentation <ArrowRight size={16}/></a><a href={url("/faq/")} class="button button-outline">Questions and answers</a></div>
</div>
