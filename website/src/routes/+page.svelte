<script lang="ts">
  import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Code2, Fingerprint, Laptop2, Layers, LockKeyhole, Monitor, ShieldCheck, Terminal, Workflow } from "@lucide/svelte";
  import { repo, url, baseUrl, brewInstall, releaseUrl } from "$lib/site";

  let active = $state<"curl" | "typescript" | "python">("curl");
  let copied = $state(false);
  let installCopied = $state(false);

  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(brewInstall);
      installCopied = true;
      window.setTimeout(() => (installCopied = false), 2000);
    } catch {
      installCopied = false;
    }
  }

  const snippets = {
    curl: `curl http://127.0.0.1:8791/v1/conversations \\
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)"`,
    typescript: `const response = await fetch(
  "http://127.0.0.1:8791/v1/conversations",
  { headers: { "X-Bridge-Key": localControllerKey } }
);
const conversations = await response.json();`,
    python: `import requests
response = requests.get(
    "http://127.0.0.1:8791/v1/conversations",
    headers={"X-Bridge-Key": local_controller_key},
    timeout=30,
)
print(response.json())`,
  };

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippets[active]);
      copied = true;
      window.setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<svelte:head>
  <title>ChatGPT Controller — Your browser. Your local API.</title>
  <meta property="og:title" content="ChatGPT Controller — Your browser. Your local API." />
  <meta property="og:description" content="A private localhost bridge for your signed-in ChatGPT browser. Native macOS control. Built for developers." />
  <link rel="canonical" href={baseUrl + "/"} />
</svelte:head>

<section class="hero">
  <div class="container">
    <div class="hero-inner">
      <div class="hero-copy">
        <a class="status-pill" href={url("/status/")}><span class="dot"></span> Independent macOS project · v0.1.0 available <ArrowUpRight size={14}/></a>
        <h1>Your browser.<br/><span class="accent">Your local API.</span></h1>
        <p class="lede">Build on top of your own signed-in ChatGPT browser with a private localhost interface. No hosted middleman. Just your Mac, your browser, and your tools.</p>
        <div class="hero-actions">
          <a class="button button-primary" href={url("/download/")}>Install for macOS <ArrowRight size={17}/></a>
          <a class="button button-outline" href={url("/docs/v1/quick-start/")}>Read the docs <Code2 size={17}/></a>
        </div>
        <div class="install-command" aria-label="Homebrew install command">
          <code>{brewInstall}</code>
          <button type="button" onclick={copyInstall} aria-label="Copy Homebrew install command">{installCopied ? "Copied ✓" : "Copy"}</button>
        </div>
        <p class="hero-note">Available for Apple Silicon · Chrome and Playwright CLI required · <a href={releaseUrl} target="_blank" rel="noopener noreferrer">v0.1.0 on GitHub ↗</a></p>
      </div>
      <div class="hero-visual">
        <div class="app-window">
          <img src={url("/images/getting-started-connected.webp")} alt="Real ChatGPT Controller desktop app showing browser connection steps and status" width="1332" height="907" fetchpriority="high" />
        </div>
        <span class="window-caption">Actual desktop application · connected setup</span>
      </div>
    </div>
    <div class="hero-bottom" aria-label="Product principles">
      <span><ShieldCheck size={17}/> Localhost-only HTTP</span>
      <span><LockKeyhole size={17}/> Separate controller key</span>
      <span><Laptop2 size={17}/> User-controlled browser sign-in</span>
      <span><Code2 size={17}/> Documented endpoints</span>
    </div>
  </div>
</section>

<section class="section inverse-section" id="workflow">
  <div class="container workflow">
    <div>
      <div class="section-heading">
        <h2>From browser to API, in three steps.</h2>
        <p class="lede">ChatGPT Controller does not replace the official OpenAI API. It automates a visible browser session you sign in to yourself.</p>
      </div>
      <ol class="steps">
        <li><span class="step-no">1</span><div><h3>Connect your browser</h3><p>Launch a dedicated Chrome profile and sign in directly to ChatGPT. Your password stays out of the desktop app.</p></div></li>
        <li><span class="step-no">2</span><div><h3>Start the local controller</h3><p>The Mac application starts a browser-backed HTTP service on <code>127.0.0.1:8791</code>.</p></div></li>
        <li><span class="step-no">3</span><div><h3>Build with the API</h3><p>Call endpoints from your scripts and local applications using a separate controller key.</p></div></li>
      </ol>
      <a href={url("/how-it-works/")} class="button button-outline">Explore the workflow <ArrowRight size={16}/></a>
    </div>
    <div>
      <div class="code-panel">
        <div class="code-title"><span>localhost · request example</span><span>HTTP</span></div>
        <div class="code-title" style="border-bottom:0;padding-bottom:0">
          <div class="code-tabs" aria-label="Code example language">
            {#each ["curl", "typescript", "python"] as tab}
              <button type="button" role="tab" aria-selected={active === tab} onclick={() => { active = tab as typeof active; copied = false; }}>{tab === "typescript" ? "TypeScript" : tab === "python" ? "Python" : "curl"}</button>
            {/each}
          </div>
          <button type="button" aria-label="Copy example" title="Copy example" onclick={copyCode} style="background:none;color:#cce2e1;border:none;font-size:.76rem">{copied ? "Copied ✓" : "Copy"}</button>
        </div>
        <pre class="code-pre"><code>{snippets[active]}</code></pre>
        <div class="code-footer">Example only · requires a running authenticated local controller</div>
      </div>
      <p style="font-size:.82rem;margin:20px 3px 0;color:#bfd1d1">Only the localhost service is exposed. ChatGPT credentials and session tokens are never exported by the controller.</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-heading">
      <h2>Build what your workflow needs.</h2>
      <p class="lede">A focused control center for developers who prefer interoperable tools over another black box.</p>
    </div>
    <div class="grid-2">
      <div class="feature-row"><div class="feature-icon"><Terminal size={21}/></div><div><h3>A real localhost interface</h3><p>Issue authenticated HTTP requests from your terminal, local apps, or developer tools.</p></div></div>
      <div class="feature-row"><div class="feature-icon"><Workflow size={21}/></div><div><h3>Conversations, under your control</h3><p>Create chats, send follow-ups, read loaded threads, and perform supported management actions.</p></div></div>
      <div class="feature-row"><div class="feature-icon"><Monitor size={21}/></div><div><h3>A native control center</h3><p>See real browser and API status, start or stop your controller, and test requests in an API explorer.</p></div></div>
      <div class="feature-row"><div class="feature-icon"><Fingerprint size={21}/></div><div><h3>Clear security boundaries</h3><p>Sign in directly through Chrome. Clients use a distinct local controller key instead of browser session credentials.</p></div></div>
    </div>
    <a href={url("/features/")} class="button button-outline" style="margin-top:30px">Explore all features <ArrowRight size={16}/></a>
  </div>
</section>

<section class="section" style="padding-top:20px">
  <div class="container showcase">
    <div class="showcase-image"><img src={url("/images/api-explorer.webp")} alt="Real API explorer in the ChatGPT Controller desktop app" width="1332" height="907" loading="lazy" /></div>
    <div>
      <h2>A practical tool, not a promise.</h2>
      <p class="lede">Inspect your connection, explore documented endpoints and make deliberate test requests directly in the app.</p>
      <ul class="showcase-list">
        <li><CheckCircle2 size={19}/> Built-in dependency and connection checks</li>
        <li><CheckCircle2 size={19}/> Copy endpoint and controller key when needed</li>
        <li><CheckCircle2 size={19}/> Explicit test prompt, not background message sending</li>
      </ul>
      <a href={url("/docs/v1/api-reference/")} class="button button-outline">Inspect the API reference <ArrowRight size={16}/></a>
      <p class="disclaimer">API availability depends on the visible browser state and may change when ChatGPT's interface changes. This is not an official service API or a way around account limits.</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="cta-band">
      <div>
        <h2>Install ChatGPT Controller on your Mac.</h2>
        <p>Version 0.1.0 is available as a verified GitHub Release and Homebrew cask. Sign in through your own Chrome browser and connect your tools locally.</p>
      </div>
      <a href={url("/download/")} class="button button-primary">Installation guide <ArrowRight size={17}/></a>
    </div>
  </div>
</section>
