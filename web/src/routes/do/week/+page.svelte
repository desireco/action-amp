<script lang="ts">
  // Week — the global Monday–Sunday scheduling horizon: dated TODAY +
  // UPCOMING tasks by weekday; overdue lands in the Today bucket; TODAY
  // commits without a date count too (the status arm of the pool).
  import TaskRow from "../../../lib/components/TaskRow.svelte";
  import GroupedList from "../../../lib/components/ui/GroupedList.svelte";
  import ListEmpty from "../../../lib/components/ui/ListEmpty.svelte";
  import CompletionCircle from "../../../lib/components/ui/CompletionCircle.svelte";
  import RowEditor from "../../../lib/components/RowEditor.svelte";
  import { lists } from "../../../lib/stores/lists.svelte";
  import { bucketWeekTasks, startOfWeekKey, dayKey, currentPlainDate, plainDateFromValue } from "../../../lib/taskView";
  import type { TaskLensListRowDto } from "../../../lib/dto";

  lists.loaded = false;
  void lists.loadToday();
  void lists.loadAppData();

  let activeTaskId = $state<string | null>(null);
  const weekStart = $derived(startOfWeekKey());

  const tasks = $derived(lists.week);
  const isLoading = $derived(lists.loading && !lists.loaded);
  const showLensPill = $derived(lists.showLensPill);
  const count = $derived(tasks.length);

  const groups = $derived.by(() => {
    const todayKey = dayKey(currentPlainDate());
    return bucketWeekTasks(tasks, weekStart).map(({ key, items }) => {
      const date = plainDateFromValue(key);
      const label = date.toLocaleString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      return {
        key,
        label: key === todayKey ? `Today · ${label}` : label,
        items,
      };
    });
  });
</script>

<section class="aa-week" aria-label="This week">
  <header class="aa-week__hero">
    <div>
      <div class="aa-eyebrow">This week</div>
      <h1 class="aa-week__title">{isLoading ? "—" : `${count} scheduled`}</h1>
      <p class="aa-week__subtitle">Give work a day. Today stays small and deliberate.</p>
    </div>
    <a href="/do/today" class="aa-btn aa-btn--secondary">Today</a>
  </header>

  {#if isLoading}
    <div class="aa-week__loading" aria-hidden="true">
      <div class="aa-skeleton aa-skeleton--heading"></div>
      <div class="aa-skeleton aa-skeleton--row"></div>
    </div>
  {:else if count === 0}
    <ListEmpty
      title="Nothing scheduled this week."
      text="Give an Upcoming task a day from its detail page when you are ready."
    >
      {#snippet icon()}
        <CompletionCircle size="lg" />
      {/snippet}
      {#snippet action()}
        <a href="/do/upcoming" class="aa-btn aa-btn--secondary">See upcoming</a>
      {/snippet}
    </ListEmpty>
  {:else}
    <GroupedList groups={groups} keepEmptyGroups headingLevel={2}>
      {#snippet renderItem(item)}
        {@const task = item as TaskLensListRowDto}
        <TaskRow
          task={task}
          showLens={showLensPill}
          expanded={activeTaskId === task.id}
          onOpen={() => (activeTaskId = activeTaskId === task.id ? null : task.id)}
        >
          {#snippet below()}
            <RowEditor task={task} onSaved={() => lists.loadToday()} />
          {/snippet}
        </TaskRow>
      {/snippet}
    </GroupedList>
  {/if}
</section>

<style>
  .aa-week {
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
  .aa-week__hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .aa-week__title {
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-semibold);
    margin: 0.2rem 0 0;
  }
  .aa-week__subtitle {
    margin: 0.15rem 0 0;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-sm);
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
  .aa-btn {
    border-radius: 8px;
    padding: 0.35rem 0.8rem;
    font-size: var(--aa-text-sm);
    cursor: pointer;
    border: 1px solid transparent;
    text-decoration: none;
    color: var(--aa-text);
    display: inline-flex;
    align-items: center;
  }
  .aa-btn--secondary {
    background: transparent;
    border-color: var(--aa-border-strong, oklch(0.85 0.006 240));
  }
</style>
