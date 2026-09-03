<script lang="ts">
  /**
   * CommandPalette — the global search/command overlay (S9 port of
   * webapp/src/search/CommandPalette.tsx; parity checklist in
   * packages/contract/src/s9-search-resources/README.md).
   *
   * Two intents (the store's `mode`): "search" (`/`) goes straight at the
   * server query; "command" (`⌘\`) additionally loads the compact index and
   * fuzzy-matches commands + entities locally. Debounce 200 ms, 2–100 char
   * window, stale-response guard, `<mark>` token highlights, wrapping arrow
   * navigation, Tab trap, focus restore, and the truthful footer count are
   * all webapp behaviors — see the sections below.
   *
   * FREE users see the shared ProGate panel instead of results (queries never
   * fire — the store's `entitled` flag mirrors webapp's shell flag).
   */
  import { goto } from "$app/navigation";
  import { client } from "../../api";
  import { search } from "../../stores/search.svelte";
  import { shell } from "../../stores/shell.svelte";
  import { capture } from "../../stores/capture.svelte";
  import { PALETTE_COMMANDS } from "./paletteRegistry";
  import { matchPaletteEntries, type SearchablePaletteEntry } from "./paletteMatching";
  import ProGate from "../ui/ProGate.svelte";
  import "../../styles/CommandPalette.css";
  import type {
    CommandIndexItem,
    SearchResultKind,
    SearchSiteResponse,
    SearchSiteResult,
  } from "@actionamp/contract";

  interface PaletteLens {
    id: string;
    name: string;
    color: string | null;
  }

  interface PaletteCommand {
    id: string;
    title: string;
    subtitle: string;
    aliases: string[];
    kindOrder: number;
    run: () => void;
  }

  type PaletteItem =
    | { type: "result"; id: string; result: SearchSiteResult }
    | { type: "command"; id: string; command: PaletteCommand };

  const KIND_ORDER: Record<SearchResultKind | "lens" | "command", number> = {
    command: 0,
    task: 1,
    project: 2,
    goal: 3,
    resource: 4,
    inbox: 5,
    lens: 6,
  };

  const mode = $derived(search.mode);
  const entitled = $derived(search.entitled);
  const lenses: PaletteLens[] = $derived(
    search.lenses.map((lens) => ({ id: lens.id, name: lens.name, color: lens.color })),
  );

  let query = $state("");
  let debouncedQuery = $state("");
  let selectedId = $state<string | null>(null);
  let inputEl: HTMLInputElement | undefined = $state();
  let cardEl: HTMLDivElement | undefined = $state();

  const normalized = $derived(query.trim().replace(/\s+/g, " "));
  const canSearch = $derived(
    entitled && normalized.length >= 2 && normalized.length <= 100,
  );

  // ---- Debounce (200 ms) + the server query, with the stale-response guard:
  // results render only while data.query === normalized && debounced ===
  // normalized (webapp useQuery's `enabled` + `currentData` behavior).
  let data = $state<SearchSiteResponse | null>(null);
  let searchError = $state(false);
  let isFetching = $state(false);

  $effect(() => {
    const timeout = window.setTimeout(() => (debouncedQuery = normalized), 200);
    return () => window.clearTimeout(timeout);
  });

  $effect(() => {
    if (!(canSearch && debouncedQuery === normalized)) return;
    const requested = debouncedQuery;
    let cancelled = false;
    isFetching = true;
    client.search
      .site({ query: requested })
      .then((res) => {
        if (cancelled || requested !== debouncedQuery || res.query !== normalized) return;
        data = res;
        searchError = false;
      })
      .catch(() => {
        if (cancelled) return;
        searchError = true;
        data = null;
      })
      .finally(() => {
        if (!cancelled) isFetching = false;
      });
    return () => {
      cancelled = true;
    };
  });

  const currentData = $derived(
    data && data.query === normalized && debouncedQuery === normalized ? data : null,
  );

  // ---- The compact index: fetched only in command mode when entitled (the
  // webapp useQuery cache — one snapshot per palette lifetime here).
  let indexItems = $state<CommandIndexItem[]>([]);
  let indexFetching = $state(false);

  $effect(() => {
    if (!(entitled && mode === "command") || indexItems.length > 0 || indexFetching) return;
    indexFetching = true;
    client.search
      .index()
      .then((res) => (indexItems = res.items))
      .catch(() => indexItems = [])
      .finally(() => (indexFetching = false));
  });

  // ---- Commands + indexed entities (webapp useMemo blocks, ported).
  const commands = $derived<PaletteCommand[]>(
    PALETTE_COMMANDS.map((definition) => ({
      id: `command-${definition.id}`,
      title: definition.title,
      subtitle: definition.subtitle,
      aliases: [...definition.aliases],
      kindOrder: KIND_ORDER.command,
      run: () => {
        if (definition.href) void goto(definition.href);
        else if (definition.action === "capture") void capture.show();
        else if (definition.action === "theme") onToggleTheme();
        else if (definition.action === "shortcuts") onOpenShortcuts();
      },
    })),
  );

  const indexedCommands = $derived.by<PaletteCommand[]>(() => {
    const byId = new Map<string, CommandIndexItem>();
    for (const lens of lenses) {
      byId.set(`lens-${lens.id}`, {
        id: lens.id,
        kind: "lens",
        title: lens.name,
        subtitle: "Switch lens",
        href: null,
        aliases: ["lens", "switch context"],
      });
    }
    for (const item of indexItems) {
      byId.set(`${item.kind}-${item.id}`, item);
    }
    return [...byId.values()].map((item) => ({
      id: `entity-${item.kind}-${item.id}`,
      title: item.title,
      subtitle: [kindLabel(item.kind), item.subtitle].filter(Boolean).join(" · "),
      aliases: item.aliases,
      kindOrder: KIND_ORDER[item.kind],
      run: () => {
        if (item.kind === "lens") onSwitchLens(item.id);
        else if (item.href) void goto(item.href);
      },
    }));
  });

  const showCommands = $derived(mode === "command" && normalized.length === 0);
  const items = $derived.by<PaletteItem[]>(() => {
    if (showCommands) {
      const commonIds = new Set(
        PALETTE_COMMANDS.filter((definition) => definition.common).map(
          (definition) => `command-${definition.id}`,
        ),
      );
      return commands
        .filter((command) => commonIds.has(command.id))
        .slice(0, 6)
        .map((command) => ({ type: "command" as const, id: command.id, command }));
    }
    if (!normalized) return [];

    const entries = new Map<string, SearchablePaletteEntry<PaletteItem>>();
    if (mode === "command") {
      for (const command of [...commands, ...indexedCommands]) {
        const item: PaletteItem = { type: "command", id: command.id, command };
        entries.set(command.id, {
          id: command.id,
          title: command.title,
          subtitle: command.subtitle,
          aliases: command.aliases,
          kindOrder: command.kindOrder,
          serverResult: false,
          payload: item,
        });
      }
    }
    for (const result of currentData?.results ?? []) {
      const id = `entity-${result.kind}-${result.id}`;
      const indexed = entries.get(id);
      const item: PaletteItem = { type: "result", id, result };
      entries.set(id, {
        id,
        title: result.title,
        subtitle: [result.lens?.name, result.subtitle].filter(Boolean).join(" "),
        aliases: indexed?.aliases ?? [result.kind],
        kindOrder: KIND_ORDER[result.kind],
        serverResult: true,
        payload: item,
      });
    }
    return matchPaletteEntries([...entries.values()], normalized).map(
      (entry) => entry.payload,
    );
  });

  // ---- Selection: reset on input; keep a valid row selected; scroll it into
  // view (webapp's three selection effects).
  $effect(() => {
    void query;
    selectedId = null;
  });
  $effect(() => {
    if (items.length === 0) selectedId = null;
    else if (!selectedId || !items.some((item) => item.id === selectedId)) {
      selectedId = items[0].id;
    }
  });
  $effect(() => {
    if (!selectedId) return;
    const option = document.getElementById(`aa-palette-option-${selectedId}`);
    if (option && cardEl?.contains(option)) {
      option.scrollIntoView?.({ block: "nearest" });
    }
  });

  const selected = $derived(
    Math.max(0, items.findIndex((item) => item.id === selectedId)),
  );

  function runItem(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    if (item.type === "command") item.command.run();
    else void goto(item.result.href);
  }

  function handleInputKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length > 0) selectedId = items[(selected + 1) % items.length].id;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length > 0)
        selectedId = items[(selected - 1 + items.length) % items.length].id;
    } else if (event.key === "Enter") {
      event.preventDefault();
      runItem(items[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function trapTab(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      cardEl?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ---- Focus restore + body scroll lock (AppShell/modal parity).
  $effect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    inputEl?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      previous?.focus();
      document.body.style.overflow = prevOverflow;
    };
  });

  function onClose() {
    search.hide();
  }

  function onSwitchLens(_id: string) {
    // The active-lens picker is a later slice (S5/S6 wiring note) — lens
    // entries close the palette like any row until it lands.
  }

  function onToggleTheme() {
    // The theme toggle is a shell concern (S-later); the command stays in the
    // registry for keyset parity until the shell composes.
  }

  function onOpenShortcuts() {
    shell.keysHint = true;
  }

  const waitingForDebounce = $derived(
    canSearch && debouncedQuery !== normalized,
  );
  const loading = $derived(
    canSearch &&
      (waitingForDebounce || isFetching || (mode === "command" && indexFetching)),
  );
  const searched = $derived(
    canSearch && debouncedQuery === normalized && !isFetching,
  );
  const activeId = $derived(
    items[selected] ? `aa-palette-option-${items[selected].id}` : undefined,
  );

  function highlightParts(value: string, q: string): Array<{ text: string; hit: boolean }> {
    const tokens = q
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (tokens.length === 0) return [{ text: value, hit: false }];
    const pattern = new RegExp(`(${tokens.join("|")})`, "gi");
    return value.split(pattern).map((part) => ({
      text: part,
      hit: tokens.some((token) => new RegExp(`^${token}$`, "i").test(part)),
    }));
  }

  function kindLabel(kind: SearchResultKind | "lens"): string {
    return {
      task: "Task",
      project: "Project",
      goal: "Goal",
      resource: "Resource",
      inbox: "Inbox record",
      lens: "Lens",
    }[kind];
  }

  function stateLabel(state: SearchSiteResult["state"]): string {
    return {
      active: "Active",
      today: "Today",
      upcoming: "Upcoming",
      someday: "Someday",
      done: "Done",
      "wont-do": "Won't do",
      inbox: "Inbox",
      archived: "Archived",
    }[state];
  }

  function matchedFieldLabel(field: SearchSiteResult["matchedField"]): string {
    return {
      title: "title",
      body: "notes",
      outcome: "outcome",
      note: "update",
      url: "link",
    }[field];
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions, a11y_interactive_supports_focus -->
<div
  class="aa-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="aa-palette-title"
  aria-describedby="aa-palette-description"
  onclick={onClose}
  onkeydown={trapTab}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    bind:this={cardEl}
    class="aa-overlay-card aa-command-palette"
    onclick={(event) => event.stopPropagation()}
  >
    <header class="aa-command-palette__header">
      <svg
        class="aa-command-palette__search-icon"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" />
        <path
          d="M10.5 10.5L14 14"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
      <div class="aa-command-palette__input-wrap">
        <h2 id="aa-palette-title" class="aa-command-palette__sr-only">
          {mode === "search" ? "Search ActionAmp" : "Command palette"}
        </h2>
        <p id="aa-palette-description" class="aa-command-palette__sr-only">
          Search tasks, projects, goals, resources, inbox notes, and commands.
        </p>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={handleInputKeyDown}
          class="aa-command-palette__input"
          maxlength={100}
          placeholder={
            mode === "search"
              ? "Search anything…"
              : "Find anything or run a command…"
          }
          role="combobox"
          aria-label="Search ActionAmp"
          aria-expanded={items.length > 0}
          aria-controls="aa-command-palette-results"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <button
        type="button"
        class="aa-overlay__close"
        onclick={onClose}
        aria-label="Close search"
        title="Close (Esc)"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    {#if !entitled}
      <div class="aa-command-palette__gate" onclick={onClose}>
        <ProGate
          feature="Command palette and search"
          reason="find and move through all your ActionAmp work from one place"
        />
      </div>
    {:else}
      <div
        id="aa-command-palette-results"
        class="aa-command-palette__results"
        role="listbox"
      >
        {#if showCommands}
          <section class="aa-command-palette__group" aria-label="Commands">
            <h3 class="aa-command-palette__group-title">Commands</h3>
            {#each items as item (item.id)}
              {#if item.type === "command"}
                <button
                  id={`aa-palette-option-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={item.id === selectedId}
                  class="aa-command-palette__row"
                  class:is-selected={item.id === selectedId}
                  onpointermove={() => (selectedId = item.id)}
                  onclick={() => runItem(item)}
                >
                  <span class="aa-command-palette__row-main">
                    <span class="aa-command-palette__row-title">{item.command.title}</span>
                    <span class="aa-command-palette__row-subtitle">{item.command.subtitle}</span>
                  </span>
                  <span class="aa-command-palette__enter" aria-hidden="true">↵</span>
                </button>
              {/if}
            {/each}
            <p class="aa-command-palette__guidance">Type to find anything.</p>
          </section>
        {:else if normalized.length === 0}
          <p class="aa-command-palette__message">
            Search tasks, projects, goals, resources, and inbox.
          </p>
        {:else if normalized.length === 1 && items.length === 0}
          <p class="aa-command-palette__message">
            Type one more character to search.
          </p>
        {:else if searchError && items.length === 0}
          <p class="aa-command-palette__message is-error" role="alert">
            {typeof navigator !== "undefined" && !navigator.onLine
              ? "Search unavailable while offline."
              : "Search unavailable. Try again."}
          </p>
        {:else if loading && items.length === 0}
          <p class="aa-command-palette__message">Searching…</p>
        {:else if searched && items.length === 0}
          <p class="aa-command-palette__message">No matches for “{normalized}”.</p>
        {:else}
          <section class="aa-command-palette__group" aria-label="Matches">
            <h3 class="aa-command-palette__group-title">Matches</h3>
            {#each items as item (item.id)}
              {#if item.type === "command"}
                <button
                  id={`aa-palette-option-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={item.id === selectedId}
                  class="aa-command-palette__row"
                  class:is-selected={item.id === selectedId}
                  onpointermove={() => (selectedId = item.id)}
                  onclick={() => runItem(item)}
                >
                  <span class="aa-command-palette__row-main">
                    <span class="aa-command-palette__row-title">{item.command.title}</span>
                    <span class="aa-command-palette__row-subtitle">{item.command.subtitle}</span>
                  </span>
                  <span class="aa-command-palette__enter" aria-hidden="true">↵</span>
                </button>
              {:else}
                {@const meta = [
                  kindLabel(item.result.kind),
                  item.result.lens?.name,
                  item.result.subtitle,
                  stateLabel(item.result.state),
                ].filter(Boolean)}
                <button
                  id={`aa-palette-option-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={item.id === selectedId}
                  class="aa-command-palette__row aa-command-palette__row--result"
                  class:is-selected={item.id === selectedId}
                  onpointermove={() => (selectedId = item.id)}
                  onclick={() => runItem(item)}
                >
                  <span class="aa-command-palette__row-main">
                    <span class="aa-command-palette__row-heading">
                      <span class="aa-command-palette__row-title">
                        {#each highlightParts(item.result.title, normalized) as part, i (i)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
                      </span>
                      <span class="aa-command-palette__row-meta">{meta.join(" · ")}</span>
                    </span>
                    {#if item.result.snippet}
                      <span class="aa-command-palette__snippet">
                        {#each highlightParts(item.result.snippet, normalized) as part, i (i)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
                      </span>
                    {/if}
                  </span>
                  <span class="aa-command-palette__matched">
                    {matchedFieldLabel(item.result.matchedField)}
                  </span>
                </button>
              {/if}
            {/each}
          </section>
        {/if}
      </div>
    {/if}

    <footer class="aa-command-palette__footer">
      <span>↑↓ move</span>
      <span>↵ open</span>
      <span>esc close</span>
      <span class="aa-command-palette__count">
        {currentData?.truncated
          ? "More matches—refine your search"
          : searched
            ? `${items.length} results`
            : loading && items.length > 0
              ? "Searching…"
              : ""}
      </span>
    </footer>
    <span class="aa-command-palette__sr-only" aria-live="polite">
      {currentData?.truncated
        ? "More matches. Refine your search."
        : searched
          ? `${items.length} results`
          : ""}
    </span>
  </div>
</div>
