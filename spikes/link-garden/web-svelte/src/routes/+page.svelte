<script lang="ts">
  import { onMount } from "svelte";
  import {
    client,
    getSessionUser,
    signIn,
    signUp,
    type Link,
    type LinkStatus,
    type SessionUser,
  } from "../lib/api";

  // ---- auth ----
  let user = $state<SessionUser | null>(null);
  let authMode = $state<"signup" | "signin">("signup");
  let authName = $state("");
  let authEmail = $state("");
  let authPassword = $state("");
  let authError = $state("");
  let authBusy = $state(false);

  // ---- app state ----
  let links = $state<Link[]>([]);
  let tab = $state<LinkStatus>("NEW");
  let selected = $state(0);
  let tagFilter = $state<string | null>(null);
  let captureOpen = $state(false);
  let captureText = $state("");
  let captureEl = $state<HTMLInputElement | undefined>(undefined);
  let tagInputFor = $state<string | null>(null);
  let tagInput = $state("");
  let tagEl = $state<HTMLInputElement | undefined>(undefined);
  let error = $state("");
  let busy = $state(false);
  let stats = $state<{ captured: number; kept: number } | null>(null);
  let dark = $state(false);

  const shown = $derived(
    links.filter(
      (l) => l.status === tab && (!tagFilter || l.tags.includes(tagFilter)),
    ),
  );

  $effect(() => {
    if (selected >= shown.length) selected = Math.max(0, shown.length - 1);
  });

  onMount(async () => {
    dark = document.documentElement.dataset.theme === "dark";
    user = await getSessionUser();
    if (user) await reload();
  });

  async function reload() {
    try {
      const [all, today] = await Promise.all([client.links.list({}), client.stats.today()]);
      links = all;
      stats = today;
    } catch (e) {
      error = String(e);
    }
  }

  function refreshStats() {
    client.stats.today().then((s) => (stats = s)).catch(() => {});
  }

  async function doAuth() {
    authError = "";
    authBusy = true;
    try {
      if (authMode === "signup") await signUp(authName, authEmail, authPassword);
      else await signIn(authEmail, authPassword);
      user = await getSessionUser();
      if (user) await reload();
      else authError = "no session after auth";
    } catch (e) {
      authError = e instanceof Error ? e.message : String(e);
    }
    authBusy = false;
  }

  function parseCapture(text: string) {
    const parts = text.trim().split(/\s+/).filter(Boolean);
    const tags = parts.filter((p) => p.startsWith("#")).map((p) => p.slice(1));
    const url = parts.find((p) => !p.startsWith("#")) ?? "";
    return { url, tags };
  }

  async function capture() {
    const { url, tags } = parseCapture(captureText);
    if (!url) {
      error = "enter a url (plus optional #tags)";
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      error = "enter a full url starting with http:// or https://";
      return;
    }
    busy = true;
    try {
      const link = await client.links.create({ url, tags });
      links = [link, ...links];
      captureText = "";
      captureOpen = false;
      tab = "NEW";
      refreshStats();
    } catch (e) {
      error = String(e);
    }
    busy = false;
  }

  function replace(updated: Link) {
    links = links.map((l) => (l.id === updated.id ? updated : l));
  }

  async function setStatus(next: LinkStatus) {
    const link = shown[selected];
    if (!link) return;
    const prev = link.status;
    links = links.map((l) => (l.id === link.id ? { ...l, status: next } : l));
    try {
      replace(await client.links.setStatus({ id: link.id, status: next }));
      refreshStats();
    } catch (e) {
      error = String(e);
      links = links.map((l) => (l.id === link.id ? { ...l, status: prev } : l));
    }
  }

  async function submitTag(link: Link) {
    const name = tagInput.trim();
    tagInputFor = null;
    if (!name || link.tags.includes(name)) return;
    links = links.map((l) => (l.id === link.id ? { ...l, tags: [...l.tags, name] } : l));
    try {
      replace(await client.links.addTag({ id: link.id, name }));
    } catch (e) {
      error = String(e);
      links = links.map((l) => (l.id === link.id ? { ...l, tags: l.tags.filter((t) => t !== name) } : l));
    }
  }

  function toggleTheme() {
    dark = !dark;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("lg-theme", dark ? "dark" : "light");
    } catch {}
  }

  function onKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      captureOpen = true;
      setTimeout(() => captureEl?.focus(), 0);
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "Escape") {
      captureOpen = false;
      tagInputFor = null;
      tagFilter = null;
      return;
    }
    if (event.key === "j") selected = Math.min(selected + 1, shown.length - 1);
    if (event.key === "k") selected = Math.max(selected - 1, 0);
    if (event.key === "K") void setStatus("KEPT");
    if (event.key === "D") void setStatus("DISMISSED");
    if (event.key === "T") {
      const link = shown[selected];
      if (link) {
        tagInputFor = link.id;
        tagInput = "";
        setTimeout(() => tagEl?.focus(), 0);
      }
    }
  }

  const host = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };

  const tabs: LinkStatus[] = ["NEW", "KEPT", "DISMISSED"];
  const countFor = (status: LinkStatus) => links.filter((l) => l.status === status).length;
</script>

<svelte:window onkeydown={onKey} />

{#if !user}
  <main class="auth">
    <h1>Link Garden</h1>
    <p class="sub">capture · triage · keep</p>
    <form onsubmit={(e) => { e.preventDefault(); void doAuth(); }}>
      {#if authMode === "signup"}
        <input bind:value={authName} placeholder="name" autocomplete="name" />
      {/if}
      <input bind:value={authEmail} placeholder="email" type="email" autocomplete="email" />
      <input bind:value={authPassword} placeholder="password" type="password" autocomplete="current-password" />
      <button type="submit" disabled={authBusy}>
        {authMode === "signup" ? "Create account" : "Sign in"}
      </button>
    </form>
    {#if authError}<p class="error">{authError}</p>{/if}
    <button class="link" onclick={() => (authMode = authMode === "signup" ? "signin" : "signup")}>
      {authMode === "signup" ? "have an account? sign in" : "new here? create an account"}
    </button>
  </main>
{:else}
  <main class="app">
    <header>
      <h1>Link Garden</h1>
      {#if stats}<span class="meta">today: {stats.captured} captured · {stats.kept} kept</span>{/if}
      <span class="spacer"></span>
      <button class="ghost" onclick={toggleTheme} title="toggle theme">{dark ? "☀" : "☾"}</button>
    </header>

    {#if captureOpen}
      <form class="capture" onsubmit={(e) => { e.preventDefault(); void capture(); }}>
        <input
          bind:this={captureEl}
          bind:value={captureText}
          placeholder="url  #tag #tag…"
          spellcheck="false"
        />
        <button type="submit" disabled={busy}>add</button>
      </form>
    {:else}
      <button class="capture-hint" onclick={() => { captureOpen = true; setTimeout(() => captureEl?.focus(), 0); }}>
        <kbd>⌘K</kbd> capture
      </button>
    {/if}

    <nav class="tabs">
      {#each tabs as status (status)}
        <button
          class:active={tab === status}
          onclick={() => { tab = status; selected = 0; }}
        >
          {status.toLowerCase()} <span class="count">{countFor(status)}</span>
        </button>
      {/each}
      {#if tagFilter}
        <button class="filter" onclick={() => (tagFilter = null)}>#{tagFilter} ✕</button>
      {/if}
    </nav>

    <ul class="list">
      {#each shown as link, index (link.id)}
        <li class:selected={index === selected}>
          <div class="row">
            <button
              type="button"
              class="row-main"
              onclick={() => (selected = index)}
            >
              <span class="title">{link.title}</span>
              <span class="host">{host(link.url)}</span>
            </button>
            <span class="chips">
              {#each link.tags as tag (tag)}
                <button class="chip" class:active={tagFilter === tag} onclick={() => (tagFilter = tag)}>#{tag}</button>
              {/each}
            </span>
          </div>
          {#if tagInputFor === link.id}
            <form class="tagline" onsubmit={(e) => { e.preventDefault(); void submitTag(link); }}>
              <input bind:this={tagEl} bind:value={tagInput} placeholder="tag name" />
            </form>
          {/if}
        </li>
      {:else}
        <li class="empty">nothing here — capture with ⌘K</li>
      {/each}
    </ul>

    <footer class="keys">
      <span><kbd>j</kbd>/<kbd>k</kbd> move</span>
      <span><kbd>K</kbd> keep</span>
      <span><kbd>D</kbd> dismiss</span>
      <span><kbd>T</kbd> tag</span>
      <span><kbd>⌘K</kbd> capture</span>
    </footer>
    {#if error}<p class="error">{error}</p>{/if}
  </main>
{/if}

<style>
  main {
    max-width: 42rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }
  h1 {
    font-size: var(--aa-text-lg);
    font-weight: var(--aa-weight-semibold);
    margin: 0;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .meta {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, var(--aa-text));
    opacity: 0.7;
  }
  .spacer { flex: 1; }
  .ghost {
    background: none;
    border: 1px solid var(--aa-border);
    border-radius: 6px;
    color: inherit;
    cursor: pointer;
    padding: 0.15rem 0.5rem;
    font-size: var(--aa-text-sm);
  }
  .capture,
  .capture-hint {
    width: 100%;
    margin-bottom: 0.75rem;
  }
  .capture {
    display: flex;
    gap: 0.5rem;
  }
  .capture input {
    flex: 1;
    font: inherit;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--aa-border-strong);
    border-radius: 8px;
    background: var(--aa-bg-soft);
    color: inherit;
  }
  .capture button {
    background: var(--aa-primary);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0 1rem;
    cursor: pointer;
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-medium);
  }
  .capture-hint {
    background: none;
    border: 1px dashed var(--aa-border-strong);
    border-radius: 8px;
    color: inherit;
    opacity: 0.75;
    padding: 0.5rem 0.75rem;
    text-align: left;
    cursor: pointer;
    font-size: var(--aa-text-sm);
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }
  .tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: inherit;
    cursor: pointer;
    font-size: var(--aa-text-sm);
    padding: 0.35rem 0.6rem;
    opacity: 0.65;
  }
  .tabs button.active {
    opacity: 1;
    border-bottom-color: var(--aa-accent);
  }
  .tabs .count {
    font-size: var(--aa-text-xs);
    opacity: 0.7;
  }
  .tabs .filter {
    margin-left: auto;
    color: var(--aa-primary);
    opacity: 1;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--aa-border);
    border-radius: 10px;
    background: var(--aa-bg-soft);
    overflow: hidden;
  }
  .list li {
    padding: 0.55rem 0.85rem;
    border-bottom: 1px solid var(--aa-border);
    cursor: pointer;
  }
  .list li:last-child { border-bottom: none; }
  .list li.selected {
    background: var(--aa-accent-soft);
    box-shadow: inset 3px 0 0 var(--aa-accent);
  }
  .list li.empty {
    cursor: default;
    opacity: 0.6;
    text-align: center;
    padding: 2rem;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  .row-main {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    color: inherit;
    text-align: left;
    padding: 0;
    cursor: pointer;
    font: inherit;
  }
  .title {
    font-size: var(--aa-text-base);
    font-weight: var(--aa-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .host {
    font-size: var(--aa-text-xs);
    opacity: 0.6;
    font-family: var(--aa-font-mono);
    white-space: nowrap;
  }
  .chips {
    margin-left: auto;
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .chip {
    background: none;
    border: 1px solid var(--aa-border-strong);
    border-radius: 999px;
    color: inherit;
    cursor: pointer;
    font-size: var(--aa-text-xs);
    padding: 0 0.45rem;
  }
  .chip.active {
    background: var(--aa-accent-soft);
    border-color: var(--aa-accent);
  }
  .tagline {
    margin-top: 0.4rem;
  }
  .tagline input {
    font: inherit;
    font-size: var(--aa-text-sm);
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--aa-border-strong);
    border-radius: 6px;
    background: var(--aa-bg);
    color: inherit;
    width: 12rem;
  }
  .keys {
    display: flex;
    gap: 1rem;
    margin-top: 0.75rem;
    font-size: var(--aa-text-xs);
    opacity: 0.55;
  }
  kbd {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    border: 1px solid var(--aa-border-strong);
    border-radius: 4px;
    padding: 0 0.25rem;
  }
  .error {
    color: var(--aa-amber-text, var(--aa-amber));
    font-size: var(--aa-text-sm);
    margin-top: 0.75rem;
  }
  .auth {
    max-width: 20rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-top: 4rem;
  }
  .auth .sub {
    margin: 0 0 0.5rem;
    font-size: var(--aa-text-sm);
    opacity: 0.6;
  }
  .auth form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .auth input {
    font: inherit;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--aa-border-strong);
    border-radius: 8px;
    background: var(--aa-bg-soft);
    color: inherit;
  }
  .auth button[type="submit"] {
    background: var(--aa-primary);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.5rem;
    cursor: pointer;
    font-weight: var(--aa-weight-medium);
  }
  .auth .link {
    background: none;
    border: none;
    color: var(--aa-primary);
    cursor: pointer;
    font-size: var(--aa-text-sm);
    padding: 0;
    text-align: left;
  }
  input:focus {
    outline: none;
    box-shadow: var(--aa-focus-ring);
  }
</style>
