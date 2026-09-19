<script lang="ts">
  // NowTile — the sidebar's always-visible running-task state (WORKFLOW §2.3:
  // "the Now state persists across navigation"). A quiet tile above the user
  // footer: ticking countdown + task name (truncated), linking back to
  // /focus. Lives in the sidebar, so it is desktop-only by construction —
  // the mobile dock has its own slots and stays untouched. The summary is
  // the whatNow store's `nowTask`, synced on app boot and every stage load.
  import { whatNow } from "../stores/whatNow.svelte";

  let tick = $state(0);

  $effect(() => {
    if (!whatNow.nowTask) return;
    const id = setInterval(() => (tick += 1), 1_000);
    return () => clearInterval(id);
  });

  // Same heartbeat rule as FocusView's clock: Date.now() isn't reactive, so
  // the tick must be read for the countdown to move. Clamps at 00:00 — an
  // expired-but-unsynced session stays calm until the next store sync.
  const remainingMs = $derived.by(() => {
    void tick;
    const task = whatNow.nowTask;
    if (!task?.sessionStartedAt) return null;
    const planned = task.plannedMinutes * 60_000;
    return Math.max(0, planned - (Date.now() - new Date(task.sessionStartedAt).getTime()));
  });

  function formatCountdown(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
</script>

{#if whatNow.nowTask}
  <a
    href="/focus"
    class="aa-now-tile"
    aria-label="In focus: {whatNow.nowTask.description} — back to focus"
    title="Back to focus"
  >
    <span class="aa-now-tile__top">
      <span class="aa-now-tile__glyph" aria-hidden="true">◷</span>
      {#if remainingMs !== null}
        <span class="aa-now-tile__time">{formatCountdown(remainingMs)}</span>
      {/if}
    </span>
    <span class="aa-now-tile__name">{whatNow.nowTask.description}</span>
  </a>
{/if}

<style>
  .aa-now-tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    padding: var(--aa-space-xs) var(--aa-space-sm);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-sm);
    background: var(--aa-surface-muted);
    text-decoration: none;
  }

  .aa-now-tile__top {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
  }

  .aa-now-tile__glyph {
    color: var(--aa-teal-cta);
    font-size: var(--aa-text-sm);
    line-height: 1;
    flex: none;
  }

  .aa-now-tile__time {
    color: var(--aa-teal-cta);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    font-variant-numeric: tabular-nums;
    flex: none;
  }

  .aa-now-tile__name {
    color: var(--aa-text-2);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-medium);
    /* Column flex sizes cross-axis children to content — clamp to the tile
       or the ellipsis never engages. */
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
