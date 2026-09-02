<script lang="ts">
  // Someday — parked: lens-scoped status=SOMEDAY, flat muted list. No
  // "→ Upcoming" affordance — the single promote path is the When chip.
  import TaskRow from "../../../lib/components/TaskRow.svelte";
  import ListEmpty from "../../../lib/components/ListEmpty.svelte";
  import CompletionCircle from "../../../lib/components/CompletionCircle.svelte";
  import RowEditor from "../../../lib/components/RowEditor.svelte";
  import { lists } from "../../../lib/stores/lists.svelte";
  import type { TaskListRowDto } from "../../../lib/dto";

  lists.loaded = false;
  void lists.loadLensList("SOMEDAY");
  void lists.loadAppData();

  let activeTaskId = $state<string | null>(null);

  const tasks = $derived(lists.someday);
  const isLoading = $derived(lists.loading && !lists.loaded);
  const lensId = $derived(lists.appData?.lenses[0]?.id ?? null);
  const count = $derived(tasks.length);
</script>

<div class="aa-someday">
  <header class="aa-list-header">
    <div>
      <div class="aa-eyebrow">Planning</div>
      <h1 class="aa-someday__title">Someday</h1>
      <p class="aa-someday__description">
        {isLoading
          ? "Loading parked tasks…"
          : `${count} parked · Kept without asking for attention today.`}
      </p>
    </div>
  </header>

  {#if isLoading}
    <div class="aa-someday__loading" aria-label="Loading Someday tasks">
      <div class="aa-skeleton aa-skeleton--heading"></div>
      <div class="aa-skeleton aa-skeleton--row"></div>
      <div class="aa-skeleton aa-skeleton--row"></div>
    </div>
  {:else if count === 0}
    <ListEmpty
      title="Nothing parked."
      text="Someday is for things you want to keep but stop nagging about. Send a task here from triage or by changing its status."
    >
      {#snippet icon()}
        <CompletionCircle size={40} />
      {/snippet}
    </ListEmpty>
  {:else}
    <ul class="aa-someday-list">
      {#each tasks as task (task.id)}
        <li>
          <TaskRow
            task={task}
            muted
            expanded={activeTaskId === task.id}
            onOpen={() => (activeTaskId = activeTaskId === task.id ? null : task.id)}
          >
            {#snippet below()}
              <RowEditor
                task={task}
                lensId={lensId}
                onSaved={() => lists.loadLensList("SOMEDAY")}
              />
            {/snippet}
          </TaskRow>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .aa-someday {
    padding: 1.5rem 1rem 3rem;
    max-width: 44rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .aa-eyebrow {
    font-size: var(--aa-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-someday__title {
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-semibold);
    margin: 0.2rem 0 0;
  }
  .aa-someday__description {
    margin: 0.15rem 0 0;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-sm);
  }
  .aa-someday-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .aa-skeleton {
    border-radius: 8px;
    background: var(--aa-surface-muted, oklch(0.96 0.005 240));
  }
  .aa-skeleton--heading {
    height: 0.7rem;
    width: 8rem;
  }
  .aa-skeleton--row {
    height: 2.2rem;
    margin-top: 0.5rem;
  }
</style>
