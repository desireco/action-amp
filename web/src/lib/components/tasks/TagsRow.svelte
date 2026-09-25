<script lang="ts">
  /**
   * TagsRow — the task-detail tags row (#16, spec docs/specs/tag-management.md).
   * Chips with × remove (the Chip primitive's own affordance); an inline add
   * input (Build decision: inline per the spec's lean) with cheap typeahead
   * over the user's tags — reserved names first. Link is resolve-or-create
   * (idempotent); unlink removes only the link. Reserved tags render muted
   * (Build decision per the spec's lean — never louder than user tags).
   * Done tasks show the chips read-only.
   */
  import { tick } from "svelte";
  import Chip from "../ui/Chip.svelte";
  import { client } from "../../api";
  import { RESERVED_TAG_NAMES } from "@actionamp/domain/tags";

  let {
    taskId,
    tags,
    editable = true,
    onChanged,
  }: {
    taskId: string;
    tags: { id: string; name: string }[];
    /** Done tasks render the chips read-only. */
    editable?: boolean;
    /** Call after every add/remove so the page refetches the task. */
    onChanged: () => void;
  } = $props();

  let adding = $state(false);
  let draft = $state("");
  let userTags = $state<{ id: string; name: string }[]>([]);
  let linkError = $state<string | null>(null);
  let inputEl: HTMLInputElement | null = $state(null);

  const isReserved = (name: string) =>
    (RESERVED_TAG_NAMES as readonly string[]).includes(name.toLowerCase());

  /** Suggestions: the user's tags minus attached ones, reserved first;
   *  an unattached reserved name is still offered (the seeder owns it). */
  const suggestions = $derived.by(() => {
    if (!adding) return [];
    const q = draft.trim().replace(/^[#@]+/, "").toLowerCase();
    const attached = new Set(tags.map((t) => t.name.toLowerCase()));
    const pool = new Map<string, { id: string | null; name: string }>();
    for (const name of RESERVED_TAG_NAMES) {
      if (!attached.has(name)) pool.set(name, { id: null, name });
    }
    for (const t of userTags) {
      if (!attached.has(t.name.toLowerCase()) && !pool.has(t.name)) {
        pool.set(t.name, { id: t.id, name: t.name });
      }
    }
    const rows = [...pool.values()];
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().startsWith(q)) : rows;
    return filtered.slice(0, 8);
  });

  async function openAdd() {
    adding = true;
    linkError = null;
    void tick().then(() => inputEl?.focus());
    try {
      userTags = await client.tags.list();
    } catch {
      // Calm degradation — the typeahead just stays reserved-only until a
      // refetch; typing a new name still resolves-or-creates server-side.
    }
  }

  function closeAdd() {
    adding = false;
    draft = "";
    linkError = null;
  }

  async function commit(name: string) {
    const clean = name.trim();
    if (!clean || !editable) return;
    linkError = null;
    try {
      await client.tags.link({ taskId, name: clean });
      closeAdd();
      onChanged();
    } catch (e) {
      linkError = e instanceof Error && e.message ? e.message : "Could not add the tag.";
    }
  }

  async function remove(tagId: string) {
    if (!editable) return;
    try {
      await client.tags.unlink({ taskId, tagId });
      onChanged();
    } catch {
      linkError = "Could not remove the tag.";
    }
  }

  function inputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit(draft || suggestions[0]?.name || "");
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAdd();
    }
  }
</script>

<div class="aa-tags-row" aria-label="Tags">
  <span class="aa-task-label">Tags</span>
  <div class="aa-tags-row__chips">
    {#each tags as tag (tag.id)}
      <Chip
        variant={isReserved(tag.name) ? "muted" : "default"}
        removable={editable}
        onRemove={editable ? () => remove(tag.id) : undefined}
      >
        {tag.name}
      </Chip>
    {/each}

    {#if editable && adding}
      <span class="aa-tags-row__editor">
        <input
          bind:this={inputEl}
          bind:value={draft}
          placeholder="Tag name…"
          aria-label="Add tag"
          onkeydown={inputKeydown}
        />
        {#if suggestions.length > 0}
          <!-- A click/tap typeahead (no roving selection) — plain buttons,
               not a listbox; the keyboard path is type + Enter. -->
          <span class="aa-tags-row__suggest">
            {#each suggestions as s (s.name)}
              <button
                type="button"
                class="aa-tags-row__suggest-item"
                data-reserved={isReserved(s.name) ? "" : undefined}
                onclick={() => void commit(s.name)}
              >
                {s.name}
              </button>
            {/each}
          </span>
        {/if}
      </span>
    {:else if editable}
      <button type="button" class="aa-tags-row__add" onclick={() => void openAdd()}>
        + Add tag
      </button>
    {/if}
  </div>
  {#if linkError}
    <span class="aa-tags-row__error" role="alert">{linkError}</span>
  {/if}
</div>

<style>
  .aa-tags-row {
    display: flex;
    align-items: flex-start;
    gap: var(--aa-space-sm);
    flex-wrap: wrap;
  }

  .aa-tags-row__chips {
    display: flex;
    align-items: center;
    gap: var(--aa-space-xs);
    flex-wrap: wrap;
  }

  .aa-tags-row__add {
    padding: 2px 8px;
    border: 1px dashed var(--aa-border-strong);
    border-radius: var(--aa-radius-full);
    background: transparent;
    color: var(--aa-text-3);
    font: inherit;
    font-size: var(--aa-text-xs);
    cursor: pointer;
    transition: color 0.15s var(--aa-ease-out), border-color 0.15s var(--aa-ease-out);
  }

  .aa-tags-row__add:hover {
    color: var(--aa-text);
    border-color: var(--aa-text-4);
  }

  .aa-tags-row__add:focus-visible {
    outline: 2px solid var(--aa-teal);
    outline-offset: 2px;
  }

  .aa-tags-row__editor {
    position: relative;
    display: inline-flex;
  }

  .aa-tags-row__editor input {
    width: 11rem;
    padding: 3px 8px;
    border: 1px solid var(--aa-border-strong);
    border-radius: var(--aa-radius-full);
    background: var(--aa-surface);
    color: var(--aa-text);
    font: inherit;
    font-size: var(--aa-text-xs);
  }

  .aa-tags-row__editor input:focus {
    outline: none;
    border-color: var(--aa-teal);
    box-shadow: var(--aa-focus-ring);
  }

  .aa-tags-row__suggest {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 11rem;
    padding: 4px;
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-md);
    background: var(--aa-surface);
    box-shadow: var(--aa-shadow-md);
  }

  .aa-tags-row__suggest-item {
    padding: 5px 8px;
    border: none;
    border-radius: var(--aa-radius-sm);
    background: transparent;
    color: var(--aa-text);
    font: inherit;
    font-size: var(--aa-text-sm);
    text-align: left;
    cursor: pointer;
  }

  .aa-tags-row__suggest-item:hover {
    background: var(--aa-surface-muted);
  }

  .aa-tags-row__suggest-item:focus-visible {
    outline: 2px solid var(--aa-teal);
    outline-offset: -2px;
  }

  /* Reserved = feeds the matcher — calm, quieter than user tags. */
  .aa-tags-row__suggest-item[data-reserved] {
    color: var(--aa-text-3);
  }

  .aa-tags-row__error {
    font-size: var(--aa-text-xs);
    color: var(--aa-rose-text);
  }
</style>
