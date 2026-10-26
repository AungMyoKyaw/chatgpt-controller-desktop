<script lang="ts">
  import { onMount, tick } from "svelte";
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import {
    Archive, ArrowUp, Check, ChevronDown, CircleAlert, Command, Copy, Ellipsis,
    FilePenLine, Menu, MessageSquare, Moon, PanelLeftClose, Plus, RefreshCw,
    Search, Send, Settings2, Sun, Trash2, Wifi, WifiOff, X
  } from "@lucide/svelte";
  import { bridge, errorMessage, type Conversation, type Message } from "$lib/api";

  type Connection = "connecting" | "online" | "offline" | "busy" | "limited";
  type Dialog = "rename" | "delete" | null;

  let connection = $state<Connection>("connecting");
  let connectedMessage = $state("");
  let conversations = $state<Conversation[]>([]);
  let activeId = $state<string | null>(null);
  let cache = $state<Record<string, Message[]>>({});
  let scratchMessages = $state<Message[]>([]);
  let loadingHistory = $state(false);
  let historyError = $state("");
  let loadingList = $state(false);
  let sending = $state(false);
  let pendingPrompt = $state("");
  let composer = $state("");
  let query = $state("");
  let sidebarVisible = $state(true);
  let menuFor = $state<string | null>(null);
  let dialog = $state<Dialog>(null);
  let dialogId = $state<string | null>(null);
  let renameValue = $state("");
  let performingAction = $state(false);
  let notice = $state("");
  let copied = $state(false);
  let showInfo = $state(false);
  let theme = $state<"light" | "dark">("light");
  let searchInput: HTMLInputElement;
  let composerInput: HTMLTextAreaElement;
  let scroller: HTMLDivElement;

  const filtered = $derived(
    conversations.filter(c => c.title.toLowerCase().includes(query.toLowerCase().trim()))
  );
  const title = $derived(
    activeId ? conversations.find(c => c.id === activeId)?.title || "Conversation" : "New conversation"
  );
  const rendered = $derived(
    activeId ? (cache[activeId] || []) : scratchMessages
  );

  function markdown(text: string): string {
    if (typeof window === "undefined") return text;
    const result = marked.parse(text, { async: false, breaks: true, gfm: true });
    return DOMPurify.sanitize(String(result), { USE_PROFILES: { html: true } });
  }
  function initials(text: string): string {
    return text.trim().charAt(0).toUpperCase() || "C";
  }
  function shortTitle(text: string) {
    return text.replace(/\s+/g, " ").trim().slice(0, 49) || "New conversation";
  }
  async function scrollEnd() {
    await tick();
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }
  function setTheme(next: "light" | "dark") {
    theme = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem("relay-theme", next);
  }

  async function refresh() {
    if (sending || performingAction) return;
    loadingList = true;
    try {
      await bridge.health();
      const result = await bridge.list();
      conversations = result.conversations.filter(c =>
        /^[0-9a-fA-F-]{36}$/.test(c.id)
      );
      connection = "online";
      connectedMessage = "";
      notice = "";
    } catch (e) {
      const message = errorMessage(e);
      connection = /another browser operation|browser is busy/i.test(message) ? "busy" : /rate.limit|429/i.test(message) ? "limited" : "offline";
      connectedMessage = message;
    } finally {
      loadingList = false;
    }
  }

  function newChat() {
    if (sending || performingAction) return;
    activeId = null;
    historyError = "";
    scratchMessages = [];
    pendingPrompt = "";
    menuFor = null;
    sidebarVisible = window.innerWidth >= 820;
    void tick().then(() => composerInput?.focus());
  }

  async function selectChat(id: string) {
    if (sending || performingAction || activeId === id && !historyError) return;
    activeId = id;
    menuFor = null;
    sidebarVisible = window.innerWidth >= 820;
    historyError = "";
    loadingHistory = true;
    try {
      const reply = await bridge.read(id);
      if (activeId === id) {
        cache = { ...cache, [id]: Array.isArray(reply.messages) ? reply.messages : [] };
        await scrollEnd();
      }
    } catch (e) {
      if (activeId === id) historyError = errorMessage(e);
    } finally {
      loadingHistory = false;
    }
  }

  async function sendMessage(text = composer) {
    const prompt = text.trim();
    if (!prompt || sending || loadingHistory || historyError || connection !== "online") return;
    const currentId = activeId;
    sending = true;
    pendingPrompt = prompt;
    composer = "";
    notice = "";
    await scrollEnd();
    try {
      const response = await bridge.send(prompt, currentId || undefined);
      const id = response.conversation_path?.match(/^\/c\/([0-9a-fA-F-]{36})$/)?.[1] || currentId;
      if (!id) throw new Error("ChatGPT responded but did not provide a conversation ID.");
      const previous = currentId ? (cache[currentId] || []) : scratchMessages;
      cache = {
        ...cache,
        [id]: [...previous, { role: "user", content: prompt }, { role: "assistant", content: response.reply }]
      };
      if (!currentId) {
        activeId = id;
        const label = shortTitle(prompt);
        conversations = [{ id, title: label }, ...conversations.filter(c => c.id !== id)];
      } else {
        conversations = [
          ...conversations.filter(c => c.id === id),
          ...conversations.filter(c => c.id !== id)
        ];
      }
      scratchMessages = [];
      await scrollEnd();
    } catch (e) {
      notice = errorMessage(e) + " The message may have been submitted. Check Chrome before retrying.";
      composer = prompt;
    } finally {
      pendingPrompt = "";
      sending = false;
      await tick();
      composerInput?.focus();
    }
  }

  function openDialog(kind: Exclude<Dialog, null>, id: string) {
    dialog = kind;
    dialogId = id;
    renameValue = conversations.find(c => c.id === id)?.title || "";
    menuFor = null;
  }
  async function changeConversation(kind: "rename" | "archive" | "delete", id: string) {
    if (sending || performingAction) return;
    performingAction = true;
    notice = "";
    try {
      if (kind === "rename") {
        const next = renameValue.trim();
        if (!next) return;
        await bridge.rename(id, next);
        conversations = conversations.map(c => c.id === id ? { ...c, title: next } : c);
      } else if (kind === "archive") {
        await bridge.archive(id);
        conversations = conversations.filter(c => c.id !== id);
        if (activeId === id) newChatAfterAction();
      } else {
        await bridge.delete(id);
        conversations = conversations.filter(c => c.id !== id);
        if (activeId === id) newChatAfterAction();
      }
      dialog = null;
      dialogId = null;
    } catch (e) {
      notice = errorMessage(e);
    } finally {
      performingAction = false;
    }
  }
  function newChatAfterAction() {
    activeId = null;
    historyError = "";
    scratchMessages = [];
  }
  async function copyText(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      window.setTimeout(() => copied = false, 1500);
    } catch { notice = "Could not copy to the clipboard."; }
  }
  function handleShortcuts(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") {
      menuFor = null; dialog = null; showInfo = false; sidebarVisible = window.innerWidth >= 820;
    }
    if (!mod) return;
    if (event.key.toLowerCase() === "n") { event.preventDefault(); newChat(); }
    if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      sidebarVisible = true;
      void tick().then(() => searchInput?.focus());
    }
    if (event.key.toLowerCase() === "r") { event.preventDefault(); void refresh(); }
  }
  onMount(() => {
    setTheme(localStorage.getItem("relay-theme") === "dark" ? "dark" : "light");
    sidebarVisible = window.innerWidth >= 820;
    void refresh();
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  });
</script>

<svelte:head>
  <title>Relay — Your conversations, in focus</title>
  <meta name="description" content="A focused local ChatGPT conversation workspace for macOS." />
</svelte:head>

<div class="app-shell">
  {#if sidebarVisible}
    <button class="sidebar-underlay" aria-label="Close conversation sidebar" onclick={() => sidebarVisible = false}></button>
  {/if}
  <aside class:revealed={sidebarVisible} class="sidebar">
    <div class="sidebar-top drag-region">
      <div class="brand no-drag" aria-label="Relay">
        <div class="brand-mark"><span></span><span></span><span></span></div>
        <span class="brand-name">relay<span class="brand-period">.</span></span>
      </div>
      <button class="icon-button no-drag sidebar-close" title="Hide sidebar" aria-label="Hide sidebar"
        onclick={() => sidebarVisible = false}><PanelLeftClose size={18} strokeWidth={1.8}/></button>
    </div>

    <div class="sidebar-body">
      <button class="new-chat-button" onclick={newChat} disabled={sending || performingAction}>
        <Plus size={17} strokeWidth={2.1}/><span>New conversation</span><span class="key-hint">⌘ N</span>
      </button>
      <div class="filter-wrap">
        <Search size={16} strokeWidth={1.85}/>
        <input bind:this={searchInput} bind:value={query} type="search"
          placeholder="Search conversations" aria-label="Search loaded conversations" />
        {#if query}<button class="clear-filter" title="Clear search" aria-label="Clear search" onclick={() => query = ""}><X size={13}/></button>{/if}
      </div>
      <div class="history-heading">
        <span>YOUR CONVERSATIONS</span>
        <button class="small-icon" title="Refresh sidebar list (⌘R)" aria-label="Refresh conversations"
          disabled={loadingList || sending} onclick={() => void refresh()}>
          <RefreshCw size={14} class={loadingList ? "spin" : ""}/>
        </button>
      </div>
      <nav class="conversation-list" aria-label="Your conversations">
        {#if loadingList && conversations.length === 0}
          <div class="side-loading"><span></span><span></span><span></span></div>
        {:else if connection !== "online" && conversations.length === 0}
          <div class="sidebar-notice">
            <WifiOff size={19} strokeWidth={1.8}/>
            <strong>Bridge not connected</strong>
            <p>Start the local controller to load your chats.</p>
          </div>
        {:else if filtered.length === 0}
          <div class="sidebar-notice">
            <Search size={19}/>
            <strong>{query ? "No matching chats" : "Nothing here yet"}</strong>
            <p>{query ? "Try another search." : "Your loaded sidebar conversations will appear here."}</p>
          </div>
        {:else}
          {#each filtered as conversation (conversation.id)}
            <div class:selected={activeId === conversation.id} class="conversation-row">
              <button class="conversation-select" aria-current={activeId === conversation.id ? "page" : undefined}
                title={conversation.title} onclick={() => void selectChat(conversation.id)}>
                <MessageSquare size={16} strokeWidth={1.65} aria-hidden="true"/>
                <span>{conversation.title || "Untitled conversation"}</span>
              </button>
              <button class="row-menu-button" title="Conversation actions" aria-label={"Actions for " + conversation.title}
                onclick={() => menuFor = menuFor === conversation.id ? null : conversation.id}>
                <Ellipsis size={17}/>
              </button>
              {#if menuFor === conversation.id}
                <div class="action-menu" role="menu" aria-label="Conversation actions">
                  <button role="menuitem" onclick={() => openDialog("rename", conversation.id)}><FilePenLine size={15}/> Rename</button>
                  <button role="menuitem" onclick={() => {menuFor = null; void changeConversation("archive", conversation.id);}}><Archive size={15}/> Archive</button>
                  <div class="menu-divider"></div>
                  <button role="menuitem" class="danger-action" onclick={() => openDialog("delete", conversation.id)}><Trash2 size={15}/> Delete</button>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </nav>
    </div>

    <div class="sidebar-footer">
      <button class="footer-info" onclick={() => showInfo = !showInfo} aria-expanded={showInfo}>
        <span class="footer-icon"><Settings2 size={17}/></span>
        <span class="footer-info-label">Connection & settings <small>Local browser bridge</small></span>
        <ChevronDown size={16} class={showInfo ? "rotate" : ""}/>
      </button>
      {#if showInfo}
        <div class="info-panel">
          <strong>Private to this Mac</strong>
          <p>Relay connects to your signed-in Chrome session through the localhost bridge on port 8791.</p>
          <p>It does not read or store your ChatGPT browser credentials.</p>
          <button onclick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {#if theme === "light"}<Moon size={14}/> Use dark appearance{:else}<Sun size={14}/> Use light appearance{/if}
          </button>
        </div>
      {/if}
      <div class="footer-status">
        <span class:connected={connection === "online"} class:warning={connection === "limited"} class="status-dot"></span>
        <span>{connection === "online" ? "Local bridge connected" : connection === "connecting" ? "Connecting…" : connection === "busy" ? "Browser busy" : connection === "limited" ? "Temporarily limited" : "Bridge offline"}</span>
        <button class="theme-button" aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          title="Toggle appearance" onclick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {#if theme === "light"}<Moon size={15}/>{:else}<Sun size={15}/>{/if}
        </button>
      </div>
    </div>
  </aside>

  <main class="workspace">
    <header class="workspace-header drag-region">
      <div class="header-left no-drag">
        <button class="icon-button sidebar-toggle" aria-label="Toggle sidebar" title="Toggle sidebar"
          onclick={() => sidebarVisible = !sidebarVisible}><Menu size={20} strokeWidth={1.75}/></button>
        <div class="header-separator"></div>
        <span class="header-title">{title}</span>
      </div>
      <div class="header-actions no-drag">
        <span class="connection-badge" class:off={connection !== "online"}>
          {#if connection === "online"}<Wifi size={14} /> Connected{:else}<WifiOff size={14}/> Offline{/if}
        </span>
        <button class="icon-button new-header-button" title="New conversation (⌘N)" aria-label="New conversation"
          onclick={newChat}><FilePenLine size={18} strokeWidth={1.7}/></button>
      </div>
    </header>

    {#if connection !== "online"}
      <div class="connection-banner" role="alert">
        <CircleAlert size={19} strokeWidth={1.8}/>
        <div><strong>{connection === "busy" ? "Your browser is handling another request" : connection === "limited" ? "ChatGPT is temporarily limiting requests" : "Your local bridge is unavailable"}</strong>
          <span>{connectedMessage || "Start the browser controller and sign in to ChatGPT in Chrome."}</span>
        </div>
        <button onclick={() => void refresh()} disabled={loadingList}>Retry <RefreshCw size={14} class={loadingList ? "spin" : ""}/></button>
      </div>
    {/if}

    <div class="conversation-scroll" bind:this={scroller}>
      {#if activeId === null && scratchMessages.length === 0 && !sending}
        <div class="empty-state">
          <div class="empty-symbol"><span class="empty-sigil"><span></span><span></span><span></span></span></div>
          <h1>Where shall we begin?</h1>
          <p>A little space to think, explore, and make something great. Your conversations stay in your ChatGPT account.</p>
          <div class="suggestions">
            <button disabled={connection !== "online"} onclick={() => void sendMessage("Help me plan a focused work session for today.")}>Plan my day <ArrowUp size={14}/></button>
            <button disabled={connection !== "online"} onclick={() => void sendMessage("Explain a complex technical concept with an easy example.")}>Learn something <ArrowUp size={14}/></button>
            <button disabled={connection !== "online"} onclick={() => void sendMessage("Help me outline an ambitious side project.")}>Explore an idea <ArrowUp size={14}/></button>
          </div>
        </div>
      {:else}
        <div class="message-stack" aria-live="polite">
          {#if loadingHistory}
            <div class="load-state"><RefreshCw size={20} class="spin"/> Loading conversation…</div>
          {:else if historyError}
            <div class="history-error">
              <CircleAlert size={22}/>
              <h2>Couldn't load this conversation</h2>
              <p>{historyError}</p>
              <button onclick={() => activeId && void selectChat(activeId)}>Try again</button>
            </div>
          {:else}
            {#each rendered as message, index (index)}
              <div class:user-message={message.role === "user"} class:assistant-message={message.role === "assistant"} class="message">
                {#if message.role === "assistant"}<div class="assistant-avatar" aria-label="ChatGPT">✦</div>{/if}
                <div class="message-body">
                  {#if message.role === "assistant"}
                    <div class="assistant-label">ChatGPT</div>
                    <div class="readable response-html">{@html markdown(message.content)}</div>
                    <button class="copy-button" title="Copy response" aria-label="Copy response"
                      onclick={() => void copyText(message.content)}>
                      {#if copied}<Check size={14}/> Copied{:else}<Copy size={14}/> Copy{/if}
                    </button>
                  {:else}
                    <div class="user-bubble">{message.content}</div>
                  {/if}
                </div>
              </div>
            {/each}
            {#if sending}
              <div class="message user-message pending">
                <div class="message-body"><div class="user-bubble">{pendingPrompt}</div></div>
              </div>
              <div class="message assistant-message pending-response">
                <div class="assistant-avatar">✦</div>
                <div class="message-body">
                  <div class="assistant-label">ChatGPT</div>
                  <div class="thinking"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-copy">Working on your response…</span></div>
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>

    <div class="composer-zone">
      {#if notice}<div class="action-notice" role="alert"><CircleAlert size={17}/><span>{notice}</span><button aria-label="Dismiss" onclick={() => notice = ""}><X size={15}/></button></div>{/if}
      <div class="composer-card" class:composer-disabled={connection !== "online"}>
        <textarea bind:this={composerInput} bind:value={composer} rows="2"
          placeholder={connection === "online" ? "Message ChatGPT…" : "Connect the local bridge to start chatting"}
          disabled={connection !== "online" || sending || loadingHistory || !!historyError}
          maxlength="16000" aria-label="Message ChatGPT"
          onkeydown={(event) => {if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }}}
        ></textarea>
        <div class="composer-bottom">
          <span class="composer-note">
            <span class="model-pip"></span> ChatGPT web <ChevronDown size={12}/>
          </span>
          <div class="composer-right">
            <span class="shortcut-hint"><span class="key-icon">↵</span> to send</span>
            <button class="send-button" title="Send message" aria-label="Send message"
              disabled={!composer.trim() || sending || loadingHistory || !!historyError || connection !== "online"}
              onclick={() => void sendMessage()}>
              {#if sending}<RefreshCw class="spin" size={19}/>{:else}<ArrowUp size={19} strokeWidth={2.3}/>{/if}
            </button>
          </div>
        </div>
      </div>
      <p class="composer-disclaimer">Relay uses your local authenticated ChatGPT browser session. Standard usage limits apply.</p>
    </div>
  </main>

  {#if dialog && dialogId}
    <div class="dialog-scrim" role="presentation">
      <div class="modal" role="dialog" aria-modal="true" aria-label={dialog === "rename" ? "Rename conversation" : "Delete conversation"}>
        <div class="modal-top">
          <div class:modal-danger={dialog === "delete"} class="modal-icon">{#if dialog === "rename"}<FilePenLine size={21}/>{:else}<Trash2 size={21}/>{/if}</div>
          <button class="icon-button" aria-label="Close dialog" onclick={() => dialog = null}><X size={18}/></button>
        </div>
        {#if dialog === "rename"}
          <h2>Rename conversation</h2>
          <p>Give this conversation a name that's easy to find later.</p>
          <input class="modal-input" aria-label="Conversation title" bind:value={renameValue} maxlength="120"
            onkeydown={(e) => {if(e.key === "Enter" && dialogId) void changeConversation("rename",dialogId)}} />
        {:else}
          <h2>Delete this conversation?</h2>
          <p>This removes the conversation from your ChatGPT account. This action cannot be undone.</p>
        {/if}
        <div class="modal-footer">
          <button class="cancel-button" onclick={() => dialog = null}>Cancel</button>
          <button class:delete-confirm={dialog === "delete"} class="confirm-button"
            disabled={performingAction || (dialog === "rename" && !renameValue.trim())}
            onclick={() => {if(dialogId && dialog) void changeConversation(dialog,dialogId)}}>
            {performingAction ? "Working…" : dialog === "rename" ? "Save name" : "Delete conversation"}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .app-shell{display:flex;width:100%;height:100vh;background:var(--canvas);overflow:hidden}
  .sidebar{width:274px;flex:0 0 274px;background:var(--sidebar);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;position:relative;z-index:20}
  .sidebar-top{height:92px;padding:43px 18px 12px 22px;display:flex;align-items:center;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:11px}.brand-name{font-weight:740;font-size:23px;letter-spacing:-.06em}.brand-period{color:var(--accent)}
  .brand-mark,.empty-sigil{position:relative;width:28px;height:27px;display:inline-block;transform:rotate(-23deg)}
  .brand-mark span,.empty-sigil span{position:absolute;height:3px;width:26px;border-radius:7px;background:var(--accent);left:0}.brand-mark span:nth-child(1),.empty-sigil span:nth-child(1){top:4px;width:15px}.brand-mark span:nth-child(2),.empty-sigil span:nth-child(2){top:12px;width:25px}.brand-mark span:nth-child(3),.empty-sigil span:nth-child(3){top:20px;width:18px;left:6px}
  .icon-button,.small-icon,.theme-button,.clear-filter{width:34px;height:34px;display:grid;place-items:center;border:0;background:transparent;color:var(--muted);border-radius:9px;transition:background .14s,color .14s}
  .icon-button:hover,.small-icon:hover,.theme-button:hover,.clear-filter:hover{background:var(--line);color:var(--ink)}
  .sidebar-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:8px 12px 0}
  .new-chat-button{display:flex;align-items:center;gap:10px;background:var(--ink);color:var(--surface);border:0;border-radius:11px;padding:12px 13px;margin:4px 2px 17px;font-size:13px;font-weight:600;box-shadow:0 2px 8px #10182010;transition:transform .15s,opacity .15s}
  .new-chat-button:hover{transform:translateY(-1px);opacity:.88}.key-hint{margin-left:auto;font-size:11px;opacity:.55;font-weight:500}
  .filter-wrap{height:37px;border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 64%,transparent);border-radius:10px;display:flex;align-items:center;gap:9px;padding:0 11px;color:var(--muted);margin:0 2px 22px}
  .filter-wrap:focus-within{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in srgb,var(--ring) 20%,transparent)}.filter-wrap input{width:100%;min-width:0;border:0;background:transparent;outline:none;font-size:12px;color:var(--ink)}.filter-wrap input::placeholder{color:var(--soft)}.filter-wrap input::-webkit-search-cancel-button{display:none}
  .clear-filter{width:18px;height:20px}.history-heading{display:flex;align-items:center;justify-content:space-between;padding:0 9px 9px;color:var(--soft);font-size:10px;font-weight:750;letter-spacing:.13em}
  .small-icon{width:25px;height:25px}.conversation-list{overflow-y:auto;overflow-x:visible;flex:1;padding:2px 0 12px}
  .conversation-row{position:relative;border-radius:9px;display:flex;align-items:center;margin:2px 0}.conversation-row:hover{background:color-mix(in srgb,var(--surface) 70%,transparent)}.conversation-row.selected{background:var(--selected)}
  .conversation-select{display:flex;min-width:0;flex:1;align-items:center;gap:10px;border:0;background:transparent;color:var(--ink);text-align:left;border-radius:9px;padding:10px 8px 10px 12px;font-size:12.5px}
  .conversation-select span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.conversation-select :global(svg){flex-shrink:0;color:var(--soft)}.conversation-row.selected .conversation-select{font-weight:630}.conversation-row.selected .conversation-select :global(svg){color:var(--accent)}
  .row-menu-button{border:0;background:transparent;color:var(--soft);width:27px;height:30px;display:grid;place-items:center;flex:0 0 27px;margin-right:3px;opacity:0;border-radius:7px}.conversation-row:hover .row-menu-button,.row-menu-button:focus-visible{opacity:1}.row-menu-button:hover{background:var(--line);color:var(--ink)}
  .action-menu{position:absolute;right:4px;top:38px;background:var(--surface);box-shadow:0 8px 30px #0002;border:1px solid var(--line);border-radius:11px;padding:5px;min-width:157px;z-index:40}
  .action-menu button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;text-align:left;padding:9px 10px;color:var(--ink);font-size:12px;border-radius:6px}.action-menu button:hover{background:var(--sidebar)}.action-menu .danger-action{color:var(--danger)}.menu-divider{height:1px;background:var(--line);margin:4px}
  .sidebar-notice{padding:27px 13px;display:flex;flex-direction:column;gap:8px;color:var(--muted);align-items:flex-start}.sidebar-notice strong{font-size:13px;color:var(--ink)}.sidebar-notice p{font-size:12px;line-height:1.6;margin:0}.side-loading{display:flex;gap:6px;padding:28px 15px}.side-loading span{height:6px;width:6px;border-radius:100%;background:var(--soft);animation:dotpulse 1.2s infinite}
  .sidebar-footer{padding:11px 13px 19px;border-top:1px solid var(--line)}.footer-info{display:flex;align-items:center;gap:11px;width:100%;padding:9px;border:0;border-radius:9px;background:transparent;text-align:left;color:var(--ink)}.footer-info:hover{background:color-mix(in srgb,var(--surface) 75%,transparent)}
  .footer-icon{color:var(--muted);display:grid;place-items:center}.footer-info-label{flex:1;display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:620}.footer-info-label small{font-size:10px;color:var(--soft);font-weight:400}.footer-info :global(svg.rotate){transform:rotate(180deg)}
  .info-panel{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:14px;font-size:12px;line-height:1.6;color:var(--muted);margin:2px 0 10px}.info-panel strong{display:block;color:var(--ink);margin-bottom:5px}.info-panel p{margin:7px 0}.info-panel button{border:1px solid var(--line);border-radius:7px;background:var(--sidebar);color:var(--ink);font-size:11px;padding:7px 10px;display:flex;gap:8px;align-items:center;margin-top:9px}
  .footer-status{display:flex;align-items:center;gap:9px;padding:11px 8px 0;color:var(--muted);font-size:10.5px}.footer-status .theme-button{margin-left:auto;width:28px;height:28px}.status-dot{height:7px;width:7px;background:var(--soft);border-radius:100%;flex-shrink:0}.status-dot.connected{background:var(--positive);box-shadow:0 0 0 3px color-mix(in srgb,var(--positive) 13%,transparent)}.status-dot.warning{background:var(--warning)}
  .workspace{min-width:0;flex:1;display:flex;flex-direction:column;height:100%;position:relative;background:var(--canvas)}
  .workspace-header{height:86px;flex:0 0 86px;padding:40px 34px 15px 31px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);gap:16px}
  .header-left,.header-actions{display:flex;align-items:center;gap:13px;min-width:0}.header-title{font-size:13px;font-weight:650;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;max-width:500px}.header-separator{height:19px;width:1px;background:var(--line)}
  .sidebar-toggle{display:none}.connection-badge{display:flex;align-items:center;gap:7px;padding:7px 10px;background:color-mix(in srgb,var(--positive) 8%,transparent);border:1px solid color-mix(in srgb,var(--positive) 19%,transparent);color:var(--positive);border-radius:30px;font-size:10.5px;font-weight:620;white-space:nowrap}.connection-badge.off{color:var(--muted);background:var(--sidebar);border-color:var(--line)}
  .connection-banner{background:color-mix(in srgb,var(--warning) 10%,var(--canvas));border-bottom:1px solid color-mix(in srgb,var(--warning) 24%,var(--line));padding:11px 29px;display:flex;align-items:center;gap:13px;color:var(--warning)}
  .connection-banner>div{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}.connection-banner strong{font-size:12px}.connection-banner span{font-size:11px;color:var(--muted)}.connection-banner button{display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:7px;background:transparent;border:1px solid var(--line);font-size:11px;color:var(--ink)}
  .conversation-scroll{flex:1;overflow:auto;min-height:0;scroll-behavior:smooth}.empty-state{height:100%;min-height:350px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:34px 24px 10px;text-align:center;transform:translateY(-18px)}
  .empty-symbol{display:grid;place-items:center;height:80px;width:80px;background:var(--surface);border:1px solid var(--line);border-radius:26px;margin-bottom:27px;box-shadow:0 8px 25px #16242b08}.empty-sigil{transform:rotate(-23deg) scale(1.23)}
  .empty-state h1{font-weight:670;font-size:31px;letter-spacing:-.045em;line-height:1.15;margin:0 0 14px}.empty-state p{font-size:13.5px;line-height:1.7;max-width:390px;color:var(--muted);margin:0 auto}
  .suggestions{display:flex;gap:9px;margin-top:28px;flex-wrap:wrap;justify-content:center}.suggestions button{display:flex;align-items:center;gap:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:11.5px;font-weight:560;padding:10px 13px;border-radius:9px;transition:background .16s,border-color .16s,transform .16s}.suggestions button:hover{border-color:var(--line-strong);transform:translateY(-2px)}
  .message-stack{max-width:798px;margin:auto;padding:37px 38px 62px;display:flex;flex-direction:column;gap:32px;min-height:100%}
  .message{display:flex;gap:14px}.message-body{min-width:0;max-width:100%}.assistant-message .message-body{flex:1}.user-message{justify-content:flex-end}.user-bubble{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;background:var(--surface);border:1px solid var(--line);box-shadow:0 2px 9px #18282806;color:var(--ink);border-radius:17px 17px 5px 17px;font-size:13.5px;padding:13px 17px;max-width:540px}
  .assistant-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;color:var(--accent);background:var(--selected);font-size:18px;font-weight:bold;flex:0 0 30px;margin-top:2px}
  .assistant-label{font-size:12px;font-weight:730;margin-bottom:9px}.response-html{font-size:14px;color:var(--ink);line-height:1.75;max-width:740px}.response-html :global(h1),.response-html :global(h2),.response-html :global(h3){font-weight:690;margin:24px 0 12px;letter-spacing:-.02em;line-height:1.35}.response-html :global(h1){font-size:22px}.response-html :global(h2){font-size:18px}.response-html :global(h3){font-size:15px}.response-html :global(p){margin:0 0 15px}.response-html :global(ul),.response-html :global(ol){padding-left:23px;margin:9px 0 15px}.response-html :global(li){margin:5px 0}.response-html :global(pre){background:var(--sidebar);border:1px solid var(--line);padding:16px;border-radius:12px;overflow-x:auto;line-height:1.55}.response-html :global(code){font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.89em}.response-html :global(:not(pre)>code){background:var(--sidebar);padding:2px 5px;border-radius:5px}.response-html :global(a){color:var(--accent);text-decoration:underline;text-underline-offset:3px}.response-html :global(blockquote){border-left:1px solid var(--line-strong);padding-left:16px;color:var(--muted);margin:12px 0}.response-html :global(table){width:100%;border-collapse:collapse;font-size:12px}.response-html :global(td),.response-html :global(th){border-bottom:1px solid var(--line);padding:9px;text-align:left}
  .copy-button{display:flex;align-items:center;gap:6px;margin-top:6px;border:0;background:transparent;border-radius:7px;color:var(--soft);font-size:11px;padding:7px 8px}.copy-button:hover{color:var(--ink);background:var(--sidebar)}
  .load-state{align-self:center;margin-top:70px;display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px}.history-error{align-self:center;text-align:center;margin:auto;padding:45px 20px;color:var(--muted)}.history-error h2{font-size:19px;color:var(--ink);font-weight:630;margin:16px 0 9px}.history-error p{font-size:13px;line-height:1.65;max-width:420px}.history-error button{margin-top:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:9px 14px;border-radius:9px;font-size:12px}
  .pending-response{opacity:.9}.thinking{display:flex;align-items:center;gap:5px;min-height:30px}.thinking-dot{width:6px;height:6px;border-radius:100%;background:var(--accent)}.thinking-copy{font-size:11px;color:var(--soft);margin-left:12px}
  .composer-zone{width:100%;max-width:820px;margin:0 auto;padding:9px 29px 24px;flex-shrink:0;background:var(--canvas)}.composer-card{border:1px solid var(--line-strong);background:var(--surface);border-radius:17px;box-shadow:0 4px 24px #1018200a;overflow:hidden;transition:border-color .14s,box-shadow .14s}.composer-card:focus-within{border-color:var(--ring);box-shadow:0 6px 30px #1b376515}.composer-disabled{opacity:.7}
  .composer-card textarea{display:block;width:100%;resize:none;border:0;background:transparent;color:var(--ink);outline:none!important;padding:17px 20px 6px;line-height:1.6;font-size:13.5px;min-height:69px;max-height:180px}.composer-card textarea::placeholder{color:var(--soft)}
  .composer-bottom{padding:4px 11px 11px 17px;display:flex;align-items:center;justify-content:space-between}.composer-note{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:10.5px}.model-pip{height:7px;width:7px;border-radius:50%;background:var(--positive)}.composer-right{display:flex;align-items:center;gap:14px}.shortcut-hint{color:var(--soft);font-size:10.5px}.key-icon{display:inline-grid;place-items:center;border:1px solid var(--line);width:20px;height:18px;border-radius:5px;font-size:12px}
  .send-button{height:34px;width:34px;display:grid;place-items:center;background:var(--accent);color:#fff;border:0;border-radius:10px}.send-button:not(:disabled):hover{background:var(--accent-hover)}.send-button:disabled{opacity:.35}.composer-disclaimer{text-align:center;color:var(--soft);font-size:10px;margin:11px 0 0;line-height:1.5}
  .action-notice{display:flex;gap:10px;align-items:center;background:color-mix(in srgb,var(--danger) 8%,var(--surface));border:1px solid color-mix(in srgb,var(--danger) 20%,var(--line));color:var(--danger);padding:11px 13px;border-radius:10px;margin-bottom:10px;font-size:11px;line-height:1.5}.action-notice span{flex:1}.action-notice button{border:0;background:transparent;color:var(--danger)}
  .dialog-scrim{position:fixed;inset:0;background:#0e1b26a0;z-index:100;display:grid;place-items:center;padding:24px}.modal{width:100%;max-width:410px;border:1px solid var(--line);background:var(--surface);border-radius:18px;padding:22px;box-shadow:0 20px 80px #0003}.modal-top{display:flex;justify-content:space-between;align-items:start}.modal-icon{display:grid;place-items:center;width:43px;height:43px;border-radius:12px;background:var(--selected);color:var(--accent)}.modal-icon.modal-danger{background:color-mix(in srgb,var(--danger) 12%,var(--surface));color:var(--danger)}.modal h2{font-size:19px;letter-spacing:-.025em;margin:18px 0 8px}.modal p{font-size:12.5px;line-height:1.65;color:var(--muted);margin:0 0 22px}.modal-input{width:100%;background:var(--canvas);color:var(--ink);border:1px solid var(--line-strong);padding:11px 12px;border-radius:9px;outline:none;margin-bottom:19px;font-size:13px}.modal-footer{display:flex;justify-content:flex-end;gap:9px}.cancel-button,.confirm-button{padding:10px 13px;border-radius:9px;font-size:12px;font-weight:620}.cancel-button{background:var(--canvas);border:1px solid var(--line);color:var(--ink)}.confirm-button{background:var(--accent);color:white;border:1px solid var(--accent)}.confirm-button.delete-confirm{background:var(--danger);border-color:var(--danger)}
  :global(.spin){animation:spinning 1.1s linear infinite}@keyframes spinning{to{transform:rotate(360deg)}}.sidebar-underlay{display:none}
  @media(max-width:1050px){.sidebar{width:246px;flex-basis:246px}.workspace-header{padding-left:25px;padding-right:23px}.message-stack{padding-left:27px;padding-right:27px}}
  @media(max-width:820px){.sidebar{position:fixed;top:0;bottom:0;left:0;transform:translateX(-101%);transition:transform .2s;box-shadow:5px 0 24px #0001;width:274px;flex-basis:274px}.sidebar.revealed{transform:translateX(0)}.sidebar-underlay{display:block;position:fixed;inset:0;z-index:19;background:#0e192850;border:0}.sidebar-toggle{display:grid}.workspace-header{padding-left:27px}.header-separator{display:none}}
  @media(max-width:570px){.workspace-header{height:76px;flex-basis:76px;padding:34px 15px 11px}.header-title{font-size:12px}.connection-badge{padding:6px}.connection-badge :global(svg){display:none}.empty-state h1{font-size:25px}.empty-state p{font-size:12px}.suggestions{gap:6px}.suggestions button{font-size:10px;padding:8px}.composer-zone{padding:8px 12px 17px}.message-stack{padding:25px 17px}.composer-disclaimer{font-size:9px}.shortcut-hint{display:none}}
</style>
