<script lang="ts">
  let { open = $bindable(false), text = $bindable(""), onSubmit } = $props();

  let inputEl = $state<HTMLInputElement | undefined>(undefined);

  export function focus() {
    inputEl?.focus();
  }
</script>

{#if open}
  <form
    class="capture"
    onsubmit={(e) => {
      e.preventDefault();
      onSubmit();
    }}
  >
    <input bind:this={inputEl} bind:value={text} placeholder="url  #tag #tag…" spellcheck="false" />
    <button type="submit">add</button>
  </form>
{:else}
  <button class="capture-hint" onclick={() => { open = true; setTimeout(() => focus(), 0); }}>
    <kbd>⌘K</kbd> capture
  </button>
{/if}

<style>
  .capture,
  .capture-hint {
    width: 100%;
    margin-bottom: 0.75rem;
    box-sizing: border-box;
  }
  .capture {
    display: flex;
    gap: 0.5rem;
  }
  input {
    flex: 1;
    font: inherit;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--aa-border-strong);
    border-radius: 8px;
    background: var(--aa-bg-soft);
    color: inherit;
  }
  input:focus {
    outline: none;
    box-shadow: var(--aa-focus-ring);
  }
  button[type="submit"] {
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
  kbd {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    border: 1px solid var(--aa-border-strong);
    border-radius: 4px;
    padding: 0 0.25rem;
  }
</style>
