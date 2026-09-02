<script lang="ts">
  import { MODES, shell } from "../stores/shell.svelte";
  import TaskList from "./TaskList.svelte";

  const info = $derived(shell.info());
  const dial = $derived(MODES.map((m) => ({ ...m, active: m.id === shell.mode })));
</script>

<!-- One container, mode-keyed rendering, no navigation — switching mode
     re-renders this screen in place. Work is real already (the task list on
     the mocked contract client); Plan/Review are placeholders until their
     slices land. -->
<section class="screen" data-mode={info.id} aria-label="{info.label} mode">
  <p class="eyebrow">{info.key} · mode</p>
  <h1>{info.label}</h1>
  {#if info.id === "work"}
    <TaskList />
  {:else}
    <p class="blurb">{info.blurb}</p>
  {/if}
  {#if shell.keysHint}
    <p class="hint">Modes are renderings, not pages — the data stays, the presentation shifts.</p>
  {/if}
  <div class="dial" role="group" aria-label="Mode dial">
    {#each dial as m (m.id)}
      <button type="button" class:active={m.active} onclick={() => shell.setMode(m.id)}>
        {m.label}
      </button>
    {/each}
  </div>
</section>

<style>
  .screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem 1.25rem;
    text-align: center;
  }

  .eyebrow {
    font-size: var(--aa-text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--aa-text-3);
  }

  h1 {
    margin: 0;
    font-size: var(--aa-text-2xl);
    font-weight: var(--aa-weight-semibold);
    line-height: var(--aa-leading-tight);
  }

  .blurb {
    margin: 0;
    color: var(--aa-text-2);
    font-size: var(--aa-text-md);
  }

  .hint {
    margin: 0;
    color: var(--aa-text-3);
    font-size: var(--aa-text-sm);
    max-width: 34rem;
  }

  /* Mouse-usable fallback (INTERACTION §6): the dial is clickable too. */
  .dial {
    display: flex;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  .dial button {
    font-family: inherit;
    font-size: var(--aa-text-sm);
    color: var(--aa-text-2);
    background: var(--aa-surface);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-sm);
    padding: 0.3rem 0.9rem;
    cursor: pointer;
  }

  .dial button.active {
    color: var(--aa-primary);
    border-color: var(--aa-accent);
    background: var(--aa-accent-soft);
    font-weight: var(--aa-weight-medium);
  }

  .dial button:focus-visible {
    outline: none;
    box-shadow: var(--aa-focus-ring);
  }
</style>
