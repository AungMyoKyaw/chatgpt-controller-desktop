<script lang="ts">
  import { ArrowRight, ArrowDown, CheckCircle2 } from "@lucide/svelte";
  import { url, baseUrl } from "$lib/site";
</script>
<svelte:head>
  <title>How it works · ChatGPT Controller</title>
  <meta name="description" content="A transparent walkthrough of ChatGPT Controller: sign in through Chrome, start the loopback controller, and connect a local client." />
  <link rel="canonical" href={baseUrl + "/how-it-works/"} />
</svelte:head>
<div class="container">
  <section class="content-hero"><h1>One visible browser. One local bridge.</h1><p class="lede">Everything runs on your Mac. A dedicated browser session is driven by Playwright CLI and controlled through authenticated localhost routes.</p></section>
  <div class="code-panel" style="max-width:920px;margin-bottom:70px">
    <div class="code-title"><span>Local architecture</span><span>Nothing hosted between these steps</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-around;padding:35px 24px;color:#cce2e1;text-align:center">
      <div><div style="font-size:1.2rem;font-weight:750">Your script / app</div><div style="font-size:.8rem;color:#95b4bc;margin-top:7px">Authenticated client</div></div>
      <span style="font-size:1.6rem;color:#73d8ba" aria-hidden="true">→</span>
      <div><div style="font-size:1.2rem;font-weight:750">localhost:8791</div><div style="font-size:.8rem;color:#95b4bc;margin-top:7px">Bun HTTP sidecar</div></div>
      <span style="font-size:1.6rem;color:#73d8ba" aria-hidden="true">→</span>
      <div><div style="font-size:1.2rem;font-weight:750">Dedicated Chrome</div><div style="font-size:.8rem;color:#95b4bc;margin-top:7px">Your signed-in browser</div></div>
    </div>
    <div class="code-footer">Native Tauri/Rust app manages local process lifecycle · Playwright CLI interacts with visible browser UI</div>
  </div>
  <div class="split" style="padding-bottom:90px">
    <div><h2>Get connected.</h2><p class="lede">The application guides the full process and tells you what is ready, missing or disconnected.</p></div>
    <div>
      <div class="detail"><h3>1. Start with the Mac app</h3><p>Install prerequisites: macOS Apple Silicon, Google Chrome and Playwright CLI. Open the native controller application.</p></div>
      <div class="detail"><h3>2. Sign in directly</h3><p>Choose Open ChatGPT login. Chrome opens a dedicated profile, where you enter account credentials directly on ChatGPT.</p></div>
      <div class="detail"><h3>3. Start the local service</h3><p>Use the controller to start the local API and view its health. A separate key protects requests to the local server.</p></div>
      <div class="detail"><h3>4. Call from your tools</h3><p>Copy the endpoint and controller key in the application and issue requests using curl, TypeScript, Python, or your own local client.</p></div>
    </div>
  </div>
  <div class="showcase" style="padding-bottom:90px">
    <div class="showcase-image"><img src={url("/images/getting-started-connected.webp")} alt="ChatGPT Controller getting started screen, showing the browser sign-in and local service steps" width="1332" height="907" loading="lazy" /></div>
    <div><h2>Real UI. Clear states.</h2><p class="lede">Setup, API access, explorer and sample applications are all accessible in the native desktop UI.</p><p class="disclaimer">Browser automation is interface-dependent, not an official ChatGPT API. The controller cannot guarantee every conversation is loaded or that external UI changes will not affect actions.</p><a class="button button-primary" href={url("/docs/v1/quick-start/")}>Read the setup guide <ArrowRight size={16}/></a></div>
  </div>
</div>
