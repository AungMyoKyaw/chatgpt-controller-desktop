<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
  import { url, baseUrl } from "$lib/site";
</script>
<svelte:head>
  <title>Features · ChatGPT Controller</title>
  <meta name="description" content="Explore the native controller, browser-backed local API, API explorer, conversation operations and security boundaries." />
  <link rel="canonical" href={baseUrl + "/features/"} />
</svelte:head>
<div class="container">
  <section class="content-hero">
    <h1>Control the browser. Keep the workflow.</h1>
    <p class="lede">A native Mac interface for the moving parts behind local ChatGPT automation—connection, control, HTTP requests, and honest status.</p>
  </section>
  <div class="grid-2" style="padding-bottom:70px">
    <div class="detail"><h3>Dedicated browser sign-in</h3><p>Open a dedicated, visible Chrome profile to log into your own account. The application does not accept or store passwords.</p></div>
    <div class="detail"><h3>Process-aware controls</h3><p>Start and stop the controller from the desktop app. It will not terminate an unrelated controller process it does not own.</p></div>
    <div class="detail"><h3>Private authenticated HTTP</h3><p>Connect to <code>127.0.0.1:8791</code> with a controller-specific <code>X-Bridge-Key</code>; no public API endpoint is started.</p></div>
    <div class="detail"><h3>Read and create conversations</h3><p>Create new chats, continue known threads, access visible messages and list conversations currently loaded in the sidebar.</p></div>
    <div class="detail"><h3>Conversation management</h3><p>Rename, archive, or delete supported conversations with deliberate actions and confirmation for destructive operations.</p></div>
    <div class="detail"><h3>In-app API explorer</h3><p>Probe a local endpoint, read a response and opt into sending a real test message without opening a terminal.</p></div>
    <div class="detail"><h3>Generation status inspection</h3><p>The documented status route distinguishes active generation, completed observations, and unknown states; availability depends on the current browser view.</p></div>
    <div class="detail"><h3>Client integration examples</h3><p>Use curl or build scripts and native clients. The repository includes Relay as a separate example application.</p></div>
  </div>
  <div class="showcase" style="padding-bottom:110px">
    <div class="showcase-image"><img src={url("/images/api-access.jpg")} alt="Application API access screen displaying local endpoint and protected controller key" width="1332" height="907" loading="lazy" /></div>
    <div><h2>Designed to keep the boundaries visible.</h2><p class="lede">No embedded sign-in form, no export of ChatGPT bearer tokens, and no hidden promises about browser automation reliability.</p><a class="button button-primary" href={url("/docs/v1/security/")}>Read the security model <ArrowRight size={16}/></a></div>
  </div>
  <div class="cta-band" style="margin-bottom:100px"><div><h2>Build locally, understand every hop.</h2><p>Walk through browser setup, the controller and your first request.</p></div><a class="button button-primary" href={url("/how-it-works/")}>How it works <ArrowRight size={16}/></a></div>
</div>
