<script lang="ts">
  // SimpleListChecklist — the checklist body of a Simple-list Project
  // (webapp simpleLists port): add form, Open / "Checked N" sections,
  // clear-checked confirm, and the n/j/k/space/e/Delete/Esc keyset.
  // Completion stays inside the list — never feeds Today, focus, or Review.
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import { simpleListStore } from "../stores/simpleList.svelte";

  let { projectId }: { projectId: string } = $props();

  let addInput = $state<HTMLInputElement | null>(null);
  let text = $state("");
  let selectedId = $state<string | null>(null);
  let editingId = $state<string | null>(null);
  let editText = $state("");
  let confirmClear = $state(false);
  let refocusAfterAdd = false;

  $effect(() => {
    void simpleListStore.load(projectId);
  });

  // Reset the default selection whenever the ordered set changes shape.
  const ordered = $derived(simpleListStore.ordered);
  $effect(() => {
    if (ordered.length === 0) selectedId = null;
    else if (!selectedId || !ordered.some((item) => item.id === selectedId)) {
      selectedId = ordered[0]?.id ?? null;
    }
  });

  $effect(() => {
    if (simpleListStore.saving !== null || !refocusAfterAdd) return;
    refocusAfterAdd = false;
    addInput?.focus();
  });

  async function addItem() {
    if (!text.trim()) return;
    refocusAfterAdd = true;
    const added = await simpleListStore.add(text);
    if (added) text = "";
  }

  function beginEdit(item: { id: string; text: string }) {
    selectedId = item.id;
    editingId = item.id;
    editText = item.text;
  }

  async function finishEdit(item: { id: string }) {
    if (!editText.trim()) return;
    const done = await simpleListStore.rename(item.id, editText);
    if (done) editingId = null;
  }

  function isTyping(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT")
    );
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isTyping(event.target) || confirmClear || simpleListStore.saving) return;
    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      addInput?.focus();
      return;
    }
    const index = ordered.findIndex((item) => item.id === selectedId);
    const key = event.key.toLowerCase();
    if (key === "j" || key === "k") {
      event.preventDefault();
      const delta = key === "j" ? 1 : -1;
      const next = Math.max(0, Math.min(ordered.length - 1, (index < 0 ? 0 : index) + delta));
      selectedId = ordered[next]?.id ?? null;
    } else if ((event.key === " " || event.code === "Space") && index >= 0) {
      event.preventDefault();
      const item = ordered[index];
      void simpleListStore.toggle(item);
    } else if (key === "e" && index >= 0) {
      event.preventDefault();
      beginEdit(ordered[index]);
    } else if ((event.key === "Delete" || event.key === "Backspace") && index >= 0) {
      event.preventDefault();
      void simpleListStore.remove(ordered[index].id);
    } else if (event.key === "Escape") {
      editingId = null;
      selectedId = null;
    }
  }

  function safeSourceUrl(value: string | null): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<section class="aa-simple-list">
  <form
    class="aa-simple-list__add"
    onsubmit={(event) => {
      event.preventDefault();
      void addItem();
    }}
  >
    <input
      bind:this={addInput}
      aria-label="Add an item"
      placeholder="Add an item…"
      bind:value={text}
      disabled={simpleListStore.saving === "add"}
    />
    <button type="submit" disabled={!text.trim() || simpleListStore.saving === "add"}>
      {simpleListStore.saving === "add" ? "Adding…" : "Add"}
    </button>
  </form>

  {#if simpleListStore.error}
    <p class="aa-simple-list__error" role="alert">{simpleListStore.error}</p>
  {/if}

  {#if simpleListStore.loading && !simpleListStore.loaded}
    <div class="aa-simple-list__loading" aria-label="Loading list">
      <span></span><span></span><span></span>
    </div>
  {:else if simpleListStore.items.length === 0}
    <div class="aa-simple-list__empty">
      <h2>List clear.</h2>
      <p>Add the first thing you want to remember.</p>
    </div>
  {:else}
    {#each [{ label: "Open", items: simpleListStore.open }, { label: `Checked ${simpleListStore.checked.length}`, items: simpleListStore.checked }] as section (section.label)}
      {#if section.items.length > 0}
        <div class="aa-simple-list__section">
          <h2>{section.label}</h2>
          <ul>
            {#each section.items as item (item.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
              <li
                class="{selectedId === item.id ? "selected" : ""}{item.isDone ? " is-done" : ""}"
                onclick={() => (selectedId = item.id)}
              >
                <input
                  type="checkbox"
                  aria-label="{item.isDone ? "Reopen" : "Check"} {item.text}"
                  checked={item.isDone}
                  disabled={simpleListStore.saving === item.id}
                  onchange={() => void simpleListStore.toggle(item)}
                />
                {#if editingId === item.id}
                  <input
                    class="aa-simple-list__rename"
                    aria-label="Rename {item.text}"
                    bind:value={editText}
                    onkeydown={(event) => {
                      if (event.key === "Enter") void finishEdit(item);
                      if (event.key === "Escape") editingId = null;
                    }}
                  />
                {:else}
                  <div class="aa-simple-list__body">
                    <!-- role=button (not a <button>) so linkified URLs inside
                        stay real anchors — clicks on them open the link. -->
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                    <div
                      class="aa-simple-list__title"
                      role="button"
                      tabindex="0"
                      onclick={(event) => {
                        if (event.target instanceof HTMLElement && event.target.closest("a")) return;
                        beginEdit(item);
                      }}
                      onkeydown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          beginEdit(item);
                        }
                      }}
                    >
                      {item.text}
                    </div>
                    {#if item.content || safeSourceUrl(item.sourceUrl) || item.attachments.length > 0}
                      <div class="aa-simple-list__context">
                        {#if item.content}<p>{item.content}</p>{/if}
                        {#if safeSourceUrl(item.sourceUrl)}
                          <a href={safeSourceUrl(item.sourceUrl) ?? "#"} target="_blank" rel="noreferrer">
                            Open source
                          </a>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/if}
                <button
                  class="aa-simple-list__remove"
                  type="button"
                  aria-label="Remove {item.text}"
                  disabled={simpleListStore.saving === item.id}
                  onclick={() => void simpleListStore.remove(item.id)}
                >
                  Remove
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/each}

    {#if simpleListStore.checked.length > 0}
      <button class="aa-simple-list__clear" type="button" onclick={() => (confirmClear = true)}>
        Clear checked
      </button>
    {/if}
  {/if}

  {#if confirmClear}
    <ConfirmDialog
      title="Clear checked items?"
      message="Permanently remove {simpleListStore.checked.length} checked {simpleListStore.checked.length === 1
        ? "item"
        : "items"}."
      confirmLabel={simpleListStore.saving === "clear" ? "Clearing…" : "Clear checked"}
      cancelLabel="Keep them"
      danger
      confirmDisabled={simpleListStore.saving === "clear"}
      onClose={() => (confirmClear = false)}
      onConfirm={async () => {
        await simpleListStore.clearChecked();
        confirmClear = false;
      }}
    />
  {/if}
</section>

<style>
  .aa-simple-list {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 34rem;
    margin: 0 auto;
  }
  .aa-simple-list__add {
    display: flex;
    gap: 0.5rem;
  }
  .aa-simple-list__add input {
    flex: 1;
    border: 1px solid var(--aa-border-strong, oklch(0.85 0.006 240));
    border-radius: 8px;
    padding: 0.5rem 0.7rem;
    font: inherit;
  }
  .aa-simple-list__add button {
    border: none;
    border-radius: 8px;
    background: var(--aa-primary);
    color: white;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font: inherit;
  }
  .aa-simple-list__add button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .aa-simple-list__error {
    color: var(--aa-rose-text);
    font-size: var(--aa-text-sm);
    margin: 0;
  }
  .aa-simple-list__loading {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .aa-simple-list__loading span {
    height: 0.9rem;
    border-radius: 6px;
    background: var(--aa-surface-muted, oklch(0.96 0.005 240));
  }
  .aa-simple-list__empty {
    text-align: center;
    padding: 2.5rem 0;
  }
  .aa-simple-list__empty h2 {
    margin: 0;
    font-size: var(--aa-text-lg);
    font-weight: var(--aa-weight-semibold);
  }
  .aa-simple-list__empty p {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin: 0.3rem 0 0;
  }
  .aa-simple-list__section h2 {
    font-size: var(--aa-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin: 0 0 0.4rem;
  }
  .aa-simple-list__section ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .aa-simple-list__section li {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.45rem 0.4rem;
    border-radius: 8px;
  }
  .aa-simple-list__section li.selected {
    background: var(--aa-surface-muted, oklch(0.97 0.004 240));
  }
  .aa-simple-list__section li.is-done {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-simple-list__section li.is-done .aa-simple-list__title {
    text-decoration: line-through;
  }
  .aa-simple-list__body {
    flex: 1;
    min-width: 0;
  }
  .aa-simple-list__title {
    font-size: var(--aa-text-base);
    cursor: text;
  }
  .aa-simple-list__context {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin-top: 0.15rem;
  }
  .aa-simple-list__context p {
    margin: 0;
    white-space: pre-wrap;
  }
  .aa-simple-list__rename {
    flex: 1;
    font: inherit;
    border: 1px solid var(--aa-teal);
    border-radius: 6px;
    padding: 0.25rem 0.45rem;
  }
  .aa-simple-list__remove {
    background: none;
    border: none;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-xs);
    cursor: pointer;
    flex: none;
  }
  .aa-simple-list__remove:hover {
    color: var(--aa-rose-text);
  }
  .aa-simple-list__clear {
    align-self: flex-start;
    background: none;
    border: 1px solid var(--aa-border-strong, oklch(0.85 0.006 240));
    border-radius: 8px;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    color: var(--aa-rose-text);
    font-size: var(--aa-text-sm);
  }
</style>
