<script lang="ts">
  import { onMount } from "svelte";
  import type { TaskStatus } from "../api";
  import { tasks } from "../stores/tasks.svelte";

  // The screen owns its data: it loads on mount. Against the real API this
  // hits /rpc through the contract client (see lib/api.ts).
  onMount(() => {
    void tasks.load();
  });

  const open = $derived(tasks.open);

  const WHEN_LABEL: Record<TaskStatus, string> = {
    TODAY: "today",
    UPCOMING: "upcoming",
    SOMEDAY: "someday",
    WONT_DO: "won't do",
  };
</script>

<!-- Minimal task list served by the real /rpc API through the contract
     client. Calm by design: tokens only, one amber use (IMPORTANT — the
     sanctioned human emphasis), status as quiet mono text. -->
<div class="tasks" aria-busy={tasks.busy} aria-label="Tasks">
  {#if tasks.error}
    <p class="message" role="alert">{tasks.error}</p>
  {:else if open.length === 0}
    <p class="message">{tasks.busy ? "Loading…" : "Nothing here. Capture a thought to begin."}</p>
  {:else}
    <ul class="list">
      {#each open as task (task.id)}
        <li class="row" data-priority={task.priority}>
          <span class="marker" aria-hidden="true"></span>
          <span class="desc">{task.description}</span>
          <span class="when">{WHEN_LABEL[task.status]}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .tasks {
    width: 100%;
    max-width: 26rem;
  }

  .message {
    margin: 0;
    color: var(--aa-text-3);
    font-size: var(--aa-text-sm);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    text-align: left;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.6rem;
    border-radius: var(--aa-radius-sm);
    font-size: var(--aa-text-base);
  }

  .row:hover {
    background: var(--aa-surface-muted);
  }

  .marker {
    width: 6px;
    height: 6px;
    border-radius: var(--aa-radius-full);
    background: var(--aa-border-strong);
    flex: none;
  }

  /* Amber = rare human emphasis: IMPORTANT is its sanctioned use. */
  .row[data-priority="IMPORTANT"] .marker {
    background: var(--aa-amber);
  }

  .desc {
    flex: 1;
    color: var(--aa-text);
  }

  .when {
    color: var(--aa-text-4);
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
  }
</style>
