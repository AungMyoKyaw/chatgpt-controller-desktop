<script lang="ts">
  import { url, baseUrl } from "$lib/site";
  const faqs = [
    ["Is this the official OpenAI API?", "No. ChatGPT Controller is an independent, unofficial macOS application that automates a signed-in, visible ChatGPT browser session and offers a local HTTP interface. It is not made by, affiliated with, or endorsed by OpenAI."],
    ["Do I enter my ChatGPT credentials into this application?", "No. The application opens a dedicated visible Chrome profile. Sign in directly on ChatGPT's website; the controller does not collect passwords."],
    ["Can another computer connect to the API?", "The HTTP service binds to 127.0.0.1:8791. It is intentionally a localhost service, not a network-exposed server."],
    ["Does it bypass my ChatGPT plan's limits?", "No. The tool does not provide unlimited access or bypass account limits. Browser behavior and ChatGPT interface changes can affect automation."],
    ["Can it access every conversation in my account?", "No. Its documented listing behavior is scoped to conversations currently loaded in the sidebar, and actions depend on accessible browser state."],
    ["Why is there no download yet?", "A maintainer-local build exists, but the project has no verified public GitHub Release at this stage. The download page will link verified release files when published."],
    ["Which operating systems are supported?", "The documented build target is macOS on Apple Silicon (ARM64). Chrome and Playwright CLI must also be installed."],
    ["Is the project free and open source?", "The source is licensed AGPL-3.0-or-later. The repository remains private during pre-release preparation; public open-source access is planned for release."],
    ["What happens if the browser changes?", "This is browser automation. Changes to the ChatGPT interface or loading behavior can require controller updates. No availability guarantee is made."],
    ["Can I use the controller in a custom app?", "Yes. It exposes documented localhost HTTP routes. Clients authenticate with a separate X-Bridge-Key and communicate with the local service."],
  ];
</script>
<svelte:head>
  <title>FAQ · ChatGPT Controller</title>
  <meta name="description" content="Answers about installation, security, browser automation, supported platforms, limitations and release status." />
  <link rel="canonical" href={baseUrl + "/faq/"} />
</svelte:head>
<div class="constrained">
  <section class="content-hero"><h1>Questions worth asking.</h1><p class="lede">Practical answers about how ChatGPT Controller works—and the boundaries that matter.</p></section>
  <section aria-label="Frequently asked questions" style="margin-bottom:100px">
    {#each faqs as item}
      <details class="faq-item"><summary>{item[0]}</summary><p>{item[1]}</p></details>
    {/each}
  </section>
  <div class="cta-band" style="margin-bottom:100px"><div><h2>Ready to go deeper?</h2><p>Documentation covers installation, endpoints, security and troubleshooting.</p></div><a class="button button-primary" href={url("/docs/v1/quick-start/")}>Open the docs</a></div>
</div>
