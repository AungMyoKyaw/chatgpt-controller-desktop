<script lang="ts">
  import { onMount } from "svelte";
  import {
    ArrowRight,
    BookOpen,
    Check,
    CheckCircle2,
    ChevronRight,
    CircleAlert,
    Copy,
    Eye,
    EyeOff,
    Globe2,
    KeyRound,
    Laptop,
    LayoutDashboard,
    Lock,
    Menu,
    Moon,
    Play,
    Power,
    RefreshCw,
    Send,
    Server,
    ShieldCheck,
    SquareTerminal,
    Sun,
    Terminal,
    Wifi,
    WifiOff,
    X,
  } from "@lucide/svelte";
  import {
    status,
    launchBrowser,
    startApi,
    stopApi,
    getKey,
    probe,
    testChat,
    messageOf,
    type ControllerStatus,
  } from "$lib/controller";

  type Section = "setup" | "api" | "explorer" | "sample";
  let section = $state<Section>("setup");
  let snapshot = $state<ControllerStatus | null>(null);
  let busy = $state("");
  let error = $state("");
  let success = $state("");
  let secret = $state("");
  let showKey = $state(false);
  let copied = $state("");
  let testCount = $state<number | null>(null);
  let prompt = $state("Reply with exactly CONTROLLER_READY.");
  let testAnswer = $state<{
    reply: string;
    conversation_path: string | null;
  } | null>(null);
  let dark = $state(false);
  let sidebar = $state(true);

  const pages = [
    { id: "setup" as Section, label: "Getting started", icon: LayoutDashboard },
    { id: "api" as Section, label: "API access", icon: KeyRound },
    { id: "explorer" as Section, label: "API explorer", icon: SquareTerminal },
    { id: "sample" as Section, label: "Sample applications", icon: BookOpen },
  ];
  const base = "http://127.0.0.1:8791";
  const endpoints = [
    ["GET", "/health", "Health and availability"],
    ["GET", "/v1/conversations", "List loaded sidebar chats"],
    ["GET", "/v1/conversations/{id}/messages", "Read visible messages"],
    ["GET", "/v1/conversations/{id}/status", "Check active generation status"],
    ["POST", "/v1/chat", "Create or continue a chat"],
    ["PATCH", "/v1/conversations/{id}", "Rename"],
    ["POST", "/v1/conversations/{id}/archive", "Archive"],
    ["DELETE", "/v1/conversations/{id}", "Delete with confirmation"],
  ];
  const online = $derived(snapshot?.apiOnline ?? false);
  const authenticated = $derived(snapshot?.browserAuthenticated ?? false);
  const ready = $derived(online && authenticated);
  const curl =
    'curl http://127.0.0.1:8791/v1/conversations -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)"';

  async function refresh() {
    if (busy) return;
    busy = "refresh";
    try {
      snapshot = await status();
      error = "";
    } catch (e) {
      error = messageOf(e);
    } finally {
      busy = "";
    }
  }
  async function perform(name: string, fn: () => Promise<unknown>) {
    if (busy) return;
    busy = name;
    error = "";
    success = "";
    try {
      const result = await fn();
      success = typeof result === "string" ? result : "Operation completed.";
      snapshot = await status();
    } catch (e) {
      error = messageOf(e);
    } finally {
      busy = "";
    }
  }
  async function revealKey() {
    if (secret) {
      showKey = !showKey;
      return;
    }
    busy = "key";
    error = "";
    try {
      secret = await getKey();
      showKey = true;
    } catch (e) {
      error = messageOf(e);
    } finally {
      busy = "";
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      copied = label;
      window.setTimeout(() => {
        if (copied === label) copied = "";
      }, 1800);
    } catch {
      error = "Clipboard access is unavailable. Copy the value manually.";
    }
  }
  async function copyKey() {
    try {
      if (!secret) secret = await getKey();
      await copy(secret, "key");
    } catch (e) {
      error = messageOf(e);
    }
  }
  async function copyConfig() {
    try {
      if (!secret) secret = await getKey();
      const config = {
        base_url: base,
        header: "X-Bridge-Key",
        api_key: secret,
      };
      await copy(JSON.stringify(config, null, 2), "config");
    } catch (e) {
      error = messageOf(e);
    }
  }
  async function runProbe() {
    busy = "probe";
    error = "";
    testCount = null;
    try {
      const result = await probe();
      testCount = result.visibleConversations;
      success = "Authenticated API request succeeded.";
    } catch (e) {
      error = messageOf(e);
    } finally {
      busy = "";
    }
  }
  async function runChat() {
    busy = "chat";
    error = "";
    testAnswer = null;
    try {
      testAnswer = await testChat(prompt.trim());
      success = "ChatGPT returned a response through the controller.";
    } catch (e) {
      error = messageOf(e);
    } finally {
      busy = "";
    }
  }
  function setTheme() {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("chatgpt-controller-theme", dark ? "dark" : "light");
  }
  function go(id: Section) {
    section = id;
    error = "";
    success = "";
    sidebar = window.innerWidth > 900;
  }
  onMount(() => {
    dark = localStorage.getItem("chatgpt-controller-theme") === "dark";
    setTheme();
    sidebar = window.innerWidth > 900;
    void refresh();
    const timer = window.setInterval(() => {
      if (!busy) void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  });
</script>

<svelte:head>
  <title>ChatGPT Controller — Local API</title>
  <meta
    name="description"
    content="A private local API backed by your signed-in ChatGPT browser."
  />
</svelte:head>

<div class="shell">
  {#if sidebar}<button
      class="overlay"
      aria-label="Close navigation"
      onclick={() => (sidebar = false)}
    ></button>{/if}
  <aside class:visible={sidebar} class="sidebar">
    <div class="brand drag">
      <div class="logo no-drag"><span></span><span></span><i></i></div>
      <div class="brand-name no-drag">
        <strong>Controller</strong><small>FOR CHATGPT</small>
      </div>
      <button
        class="icon-action no-drag collapse"
        aria-label="Hide navigation"
        onclick={() => (sidebar = false)}><X size={17} /></button
      >
    </div>
    <p class="nav-label">WORKSPACE</p>
    <nav aria-label="Main navigation">
      {#each pages as page}
        <button class:active={section === page.id} onclick={() => go(page.id)}>
          <page.icon size={18} strokeWidth={1.8} /><span>{page.label}</span>
          {#if section === page.id}<ChevronRight size={15} />{/if}
        </button>
      {/each}
    </nav>
    <div class="side-bottom">
      <div class="service">
        <span class:good={online} class="pulse"></span>
        <div>
          <strong
            >{online ? "API service online" : "API service offline"}</strong
          ><small>127.0.0.1:8791</small>
        </div>
        <button
          class="icon-action"
          title="Refresh status"
          aria-label="Refresh status"
          disabled={!!busy}
          onclick={() => void refresh()}><RefreshCw size={16} /></button
        >
      </div>
      <button
        class="theme-toggle"
        onclick={() => {
          dark = !dark;
          setTheme();
        }}
      >
        {#if dark}<Sun size={17} />{:else}<Moon size={17} />{/if}
        <span>{dark ? "Light appearance" : "Dark appearance"}</span>
        <small>v0.1</small>
      </button>
    </div>
  </aside>
  <div class="workspace">
    <header class="topbar drag">
      <div class="top-left no-drag">
        <button
          class="icon-action mobile-menu"
          aria-label="Toggle navigation"
          onclick={() => (sidebar = !sidebar)}><Menu size={20} /></button
        >
        <span>Controller</span><ChevronRight size={14} /><strong
          >{pages.find((p) => p.id === section)?.label}</strong
        >
      </div>
      <div class="top-right no-drag">
        <span class:good={authenticated} class="indicator"
          ><span></span>Browser {authenticated
            ? "signed in"
            : snapshot?.browserOpen
              ? "open"
              : "offline"}</span
        >
        <span class:good={online} class="indicator"
          ><span></span>API {online ? "online" : "offline"}</span
        >
        <button
          class="icon-action"
          title="Refresh connection"
          aria-label="Refresh connection"
          disabled={!!busy}
          onclick={() => void refresh()}
          ><RefreshCw
            size={16}
            class={busy === "refresh" ? "spin" : ""}
          /></button
        >
      </div>
    </header>

    <main class="viewport">
      <div class="inner">
        {#if error}<div class="notice error" role="alert">
            <CircleAlert size={18} /><span>{error}</span><button
              aria-label="Dismiss error"
              onclick={() => (error = "")}><X size={15} /></button
            >
          </div>{/if}
        {#if success}<div class="notice success" role="status">
            <CheckCircle2 size={18} /><span>{success}</span><button
              aria-label="Dismiss notice"
              onclick={() => (success = "")}><X size={15} /></button
            >
          </div>{/if}

        {#if section === "setup"}
          <div class="intro">
            <span class="kicker">YOUR LOCAL GATEWAY</span>
            <h1>ChatGPT, on your terms.</h1>
            <p>
              Turn your signed-in ChatGPT browser into a private local API.
              Connect once, then build your own applications on top of it.
            </p>
          </div>
          <div class="section-head">
            <h2>Let's get you connected</h2>
            <small>THREE SIMPLE STEPS</small>
          </div>
          <div class="steps">
            <div class="step">
              <div class:complete={authenticated} class="number">
                {#if authenticated}<Check size={18} />{:else}1{/if}
              </div>
              <div class="step-content">
                <div class="step-top">
                  <div>
                    <h3>Sign in through Chrome</h3>
                    <p>
                      Your account credentials stay in Chrome. The controller
                      never sees your password.
                    </p>
                  </div>
                  <span class:done={authenticated} class="step-badge"
                    >{authenticated ? "CONNECTED" : "FIRST STEP"}</span
                  >
                </div>
                <div class="actions">
                  <button
                    class="primary"
                    disabled={!!busy || !snapshot?.playwrightInstalled}
                    onclick={() => void perform("login", launchBrowser)}
                  >
                    <Globe2 size={17} />{authenticated
                      ? "Open signed-in browser"
                      : "Open ChatGPT login"}<ArrowRight size={15} />
                  </button>
                  {#if !snapshot?.playwrightInstalled}<span class="hint warn"
                      >Install with <code>bun add -g @playwright/cli</code>,
                      then refresh.</span
                    >
                  {:else if authenticated}<span class="hint positive"
                      ><Check size={14} />Chrome is authenticated</span
                    >
                  {:else if snapshot?.browserOpen}<span class="hint"
                      >Complete sign-in in Chrome, then refresh</span
                    >{/if}
                </div>
              </div>
            </div>
            <div class="step">
              <div class:complete={online} class="number">
                {#if online}<Check size={18} />{:else}2{/if}
              </div>
              <div class="step-content">
                <div class="step-top">
                  <div>
                    <h3>Start your private API</h3>
                    <p>
                      Serve requests at <code>127.0.0.1:8791</code> on this Mac. No
                      public server or cloud deployment.
                    </p>
                  </div>
                  <span class:done={online} class="step-badge"
                    >{online ? "RUNNING" : "NEXT STEP"}</span
                  >
                </div>
                <div class="actions">
                  {#if online}
                    <button
                      class="secondary"
                      disabled={!!busy || !snapshot?.ownedProcess}
                      onclick={() => void perform("stop", stopApi)}
                    >
                      <Power size={16} />Stop controller
                    </button>
                    <span class="hint positive"
                      ><Check size={14} />HTTP service responds</span
                    >
                  {:else}
                    <button
                      class="primary"
                      disabled={!!busy}
                      onclick={() => void perform("start", startApi)}
                    >
                      <Server size={17} />Start controller<ArrowRight
                        size={15}
                      />
                    </button>
                  {/if}
                </div>
                {#if snapshot?.note}<p class="aside-note">
                    {snapshot.note}
                  </p>{/if}
              </div>
            </div>
            <div class="step">
              <div class="number">3</div>
              <div class="step-content">
                <div class="step-top">
                  <div>
                    <h3>Connect your application</h3>
                    <p>
                      Export a localhost URL and controller-issued key to use in
                      your own clients.
                    </p>
                  </div>
                  <span class="step-badge">FINAL STEP</span>
                </div>
                <div class="actions">
                  <button class="secondary" onclick={() => go("api")}
                    ><KeyRound size={17} />View API access<ArrowRight
                      size={15}
                    /></button
                  >
                  <button class="link-button" onclick={() => go("explorer")}
                    >Test an API request <ArrowRight size={14} /></button
                  >
                </div>
              </div>
            </div>
          </div>
          <div class="assurance">
            <ShieldCheck size={23} />
            <div>
              <strong>Private by design</strong>
              <p>
                Browser cookies and bearer tokens never leave Chrome. Your
                exported API key authorizes this local controller only.
                ChatGPT's normal usage limits apply.
              </p>
            </div>
          </div>
        {:else if section === "api"}
          <div class="intro">
            <span class="kicker">DEVELOPER ACCESS</span>
            <h1>Your API, ready to use.</h1>
            <p>
              Use these credentials to connect a trusted local application. They
              belong to your controller—not to your ChatGPT session.
            </p>
          </div>
          <section class="panel">
            <div class="panel-top">
              <div>
                <h2>Connection details</h2>
                <p>Copy these into your local application.</p>
              </div>
              <span class="online-label"
                ><span class:good={online} class="pulse"></span>{online
                  ? "Listening"
                  : "Not started"}</span
              >
            </div>
            <div class="field">
              <span class="field-label">BASE URL</span>
              <div class="copy-value">
                <code>{base}</code><button
                  title="Copy API URL"
                  aria-label="Copy API URL"
                  onclick={() => void copy(base, "url")}
                  >{#if copied === "url"}<Check size={17} />{:else}<Copy
                      size={17}
                    />{/if}</button
                >
              </div>
            </div>
            <div class="field">
              <span class="field-label">CONTROLLER API KEY</span>
              <div class="copy-value">
                <code
                  >{secret && showKey
                    ? secret
                    : "•••• •••• •••• •••• •••• •••• •••• ••••"}</code
                >
                <button
                  title={showKey ? "Hide key" : "Reveal key"}
                  aria-label={showKey ? "Hide key" : "Reveal key"}
                  onclick={() => void revealKey()}
                  >{#if showKey}<EyeOff size={17} />{:else}<Eye
                      size={17}
                    />{/if}</button
                >
                <button
                  title="Copy API key"
                  aria-label="Copy API key"
                  onclick={() => void copyKey()}
                  >{#if copied === "key"}<Check size={17} />{:else}<Copy
                      size={17}
                    />{/if}</button
                >
              </div>
            </div>
            <p class="key-note">
              <Lock size={15} />Treat this key like a password. It can access
              your locally controlled conversations.
            </p>
            <div class="export-row">
              <button class="secondary" onclick={() => void copyConfig()}
                >{#if copied === "config"}<Check size={16} />Configuration
                  copied{:else}<Copy size={16} />Export API config (JSON){/if}</button
              ><span
                >Contains your local controller key. Share only with trusted
                local apps.</span
              >
            </div>
          </section>
          <section class="panel">
            <div class="panel-top">
              <div>
                <h2>Your first request</h2>
                <p>Run this command in your terminal.</p>
              </div>
              <button class="ghost" onclick={() => void copy(curl, "curl")}
                >{#if copied === "curl"}<Check size={15} />{:else}<Copy
                    size={15}
                  />{/if}Copy</button
              >
            </div>
            <pre class="code"><code>$ {curl}</code></pre>
          </section>
          <section class="panel">
            <div class="panel-top">
              <div>
                <h2>Endpoint reference</h2>
                <p>Currently supported local operations.</p>
              </div>
              <span class="api-version">LOCAL / V1</span>
            </div>
            <div class="endpoint-list">
              {#each endpoints as e}<div class="endpoint">
                  <b
                    class:post={e[0] === "POST"}
                    class:delete={e[0] === "DELETE"}>{e[0]}</b
                  ><code>{e[1]}</code><span>{e[2]}</span>
                </div>{/each}
            </div>
          </section>
        {:else if section === "explorer"}
          <div class="intro">
            <span class="kicker">INTERACTIVE TESTING</span>
            <h1>Make a real request.</h1>
            <p>
              Verify the signed-in browser and try the local API. These
              operations call your actual running controller—not mock responses.
            </p>
          </div>
          <section class="panel">
            <div class="panel-top">
              <div>
                <h2>Authenticated connectivity</h2>
                <p>Read five conversation summaries from the loaded sidebar.</p>
              </div>
              <span class="tag"><ShieldCheck size={14} />READ ONLY</span>
            </div>
            <div class="request-line">
              <b>GET</b><code>/v1/conversations?limit=5</code><button
                class="primary"
                disabled={!online || !!busy}
                onclick={() => void runProbe()}
                >{#if busy === "probe"}<RefreshCw
                    size={15}
                    class="spin"
                  />{:else}<Play size={15} />{/if}Run request</button
              >
            </div>
            {#if testCount !== null}<div class="result">
                <CheckCircle2 size={19} />
                <div>
                  <strong>HTTP 200 — Request succeeded</strong>
                  <p>
                    {testCount} conversations available in the currently loaded sidebar.
                  </p>
                </div>
              </div>{/if}
          </section>
          <section class="panel">
            <div class="panel-top">
              <div>
                <h2>Send a ChatGPT message</h2>
                <p>This creates a conversation in your real ChatGPT account.</p>
              </div>
              <span class="tag amber"><Send size={14} />WRITES A CHAT</span>
            </div>
            <div class="field">
              <label for="prompt">PROMPT</label><textarea
                id="prompt"
                bind:value={prompt}
                rows="4"
                maxlength="12000"
                placeholder="Ask ChatGPT something…"></textarea>
            </div>
            <div class="form-bottom">
              <span
                >Replies arrive after completion; streaming is not yet
                supported.</span
              ><button
                class="primary"
                disabled={!online || !prompt.trim() || !!busy}
                onclick={() => void runChat()}
                ><Send size={15} />{busy === "chat"
                  ? "Waiting for ChatGPT…"
                  : "Send request"}</button
              >
            </div>
            {#if testAnswer}<div class="reply">
                <strong>CHATGPT RESPONSE</strong>
                <p>{testAnswer.reply}</p>
                <small>{testAnswer.conversation_path}</small><button
                  class="ghost"
                  onclick={() => void copy(testAnswer?.reply || "", "reply")}
                  ><Copy size={14} />Copy answer</button
                >
              </div>{/if}
          </section>
          <div class="assurance">
            <CircleAlert size={21} />
            <div>
              <strong>Browser-backed, not an official API</strong>
              <p>
                ChatGPT may reject or limit requests. If the browser is
                rate-limited, the controller reports the error rather than
                bypassing it.
              </p>
            </div>
          </div>
        {:else}
          <div class="intro">
            <span class="kicker">LEARN BY BUILDING</span>
            <h1>One API. Your own interface.</h1>
            <p>
              Relay demonstrates how to connect a native desktop client to the
              local API. Its complete source lives in this project's <code
                >samples/relay</code
              > directory.
            </p>
          </div>
          <div class="sample-card">
            <div class="sample-mark"><span>R</span></div>
            <div>
              <span class="sample-label">INCLUDED SAMPLE APPLICATION</span>
              <h2>Relay</h2>
              <p>
                A focused native chat workspace built with Tauri, Rust, Svelte 5
                and Tailwind CSS 4.
              </p>
              <div class="tech">
                <span>TAURI 2</span><span>SVELTE 5</span><span>RUST</span><span
                  >TAILWIND 4</span
                >
              </div>
            </div>
          </div>
          <section class="panel">
            <div class="panel-top">
              <div>
                <h2>Run Relay locally</h2>
                <p>
                  The sample remains an independent project, not a component of
                  this controller.
                </p>
              </div>
            </div>
            <div class="instructions">
              <div>
                <span>1</span>
                <p>
                  <strong>Complete controller setup</strong><small
                    >Open Chrome, sign in, and start the API service.</small
                  >
                </p>
              </div>
              <div>
                <span>2</span>
                <p>
                  <strong>Install sample dependencies</strong><small
                    >Open a terminal in <code>samples/relay</code> and run
                    <code>bun install</code>.</small
                  >
                </p>
              </div>
              <div>
                <span>3</span>
                <p>
                  <strong>Launch the sample app</strong><small
                    >Relay reads the same local controller key from your Mac.</small
                  >
                </p>
              </div>
            </div>
            <div class="copy-value sample-command">
              <code>cd samples/relay && bun install && bun run tauri dev</code
              ><button
                title="Copy sample command"
                onclick={() =>
                  void copy(
                    "cd samples/relay && bun install && bun run tauri dev",
                    "sample",
                  )}
                >{#if copied === "sample"}<Check size={17} />{:else}<Copy
                    size={17}
                  />{/if}</button
              >
            </div>
          </section>
          <section class="panel">
            <div class="panel-top">
              <div>
                <h2>How it works</h2>
                <p>
                  The browser owns ChatGPT authentication; the controller owns
                  the local API.
                </p>
              </div>
            </div>
            <div class="architecture">
              <div>
                <Laptop size={22} /><strong>Your application</strong><small
                  >Relay or another client</small
                >
              </div>
              <ArrowRight size={19} />
              <div>
                <Server size={22} /><strong>Controller API</strong><small
                  >127.0.0.1:8791</small
                >
              </div>
              <ArrowRight size={19} />
              <div>
                <Globe2 size={22} /><strong>Signed-in Chrome</strong><small
                  >chatgpt.com</small
                >
              </div>
            </div>
          </section>
        {/if}
      </div>
    </main>
    <footer>
      <span><ShieldCheck size={14} />Local-only controller</span><span
        >Independent project · Not affiliated with OpenAI</span
      >
    </footer>
  </div>
</div>
