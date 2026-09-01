<script lang="ts">
  import { links } from "../stores/links.svelte";
  import { host } from "../parse";

  let tagInput = $state("");
  let tagEl = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    if (links.tagTarget) setTimeout(() => tagEl?.focus(), 0);
  });

  async function submitTag(linkId: string) {
    const link = links.links.find((l) => l.id === linkId);
    if (!link) return;
    const name = tagInput;
    links.tagTarget = null;
    tagInput = "";
    await links.submitTag(link, name.trim());
  }
</script>

<ul class="list">
  {#each links.shown as link, index (link.id)}
    <li class:selected={index === links.selected}>
      <div class="row">
        <button type="button" class="row-main" onclick={() => (links.selected = index)}>
          <span class="title">{link.title}</span>
          <span class="host">{host(link.url)}</span>
        </button>
        <span class="chips">
          {#each link.tags as tag (tag)}
            <button
              class="chip"
              class:active={links.tagFilter === tag}
              onclick={() => (links.tagFilter = tag)}
            >#{tag}</button>
          {/each}
        </span>
      </div>
      {#if links.tagTarget === link.id}
        <form class="tagline" onsubmit={(e) => { e.preventDefault(); void submitTag(link.id); }}>
          <input bind:this={tagEl} bind:value={tagInput} placeholder="tag name" />
        </form>
      {/if}
    </li>
  {:else}
    <li class="empty">nothing here — capture with ⌘K</li>
  {/each}
</ul>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--aa-border);
    border-radius: 10px;
    background: var(--aa-bg-soft);
    overflow: hidden;
  }
  li {
    padding: 0.55rem 0.85rem;
    border-bottom: 1px solid var(--aa-border);
  }
  li:last-child { border-bottom: none; }
  li.selected {
    background: var(--aa-accent-soft);
    box-shadow: inset 3px 0 0 var(--aa-accent);
  }
  li.empty {
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
  .tagline { margin-top: 0.4rem; }
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
  .tagline input:focus {
    outline: none;
    box-shadow: var(--aa-focus-ring);
  }
</style>
