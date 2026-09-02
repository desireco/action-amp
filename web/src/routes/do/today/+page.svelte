<script lang="ts">
  // Today — the global committed-for-today list (across all accessible
  // lenses), capped: the first todayCap rows group by Goal; the overflow
  // renders muted under the amber "Over capacity" banner with a "Do" button
  // (the picked-task path). Done-today groups the same way.
  import TaskRow from "../../../lib/components/TaskRow.svelte";
  import GroupedList from "../../../lib/components/GroupedList.svelte";
  import CountLinkButton from "../../../lib/components/CountLinkButton.svelte";
  import ListEmpty from "../../../lib/components/ListEmpty.svelte";
  import CompletionCircle from "../../../lib/components/CompletionCircle.svelte";
  import RowEditor from "../../../lib/components/RowEditor.svelte";
  import FeedbackDialog from "../../../lib/components/FeedbackDialog.svelte";
  import { lists } from "../../../lib/stores/lists.svelte";
  import { feedback } from "../../../lib/stores/feedback.svelte";
  import type { TaskLensListRowDto } from "../../../lib/dto";

  lists.loaded = false;
  void lists.loadToday();

  let showDone = $state(true);
  let activeTaskId = $state<string | null>(null);

  const tasks = $derived(lists.today);
  const todayCap = $derived(lists.todayCap);
  const showLensPill = $derived(lists.showLensPill);
  const overCapacity = $derived(tasks.length > todayCap);
  const overflow = $derived(tasks.slice(todayCap));
  const committedCount = $derived(Math.min(tasks.length, todayCap));
  const upcomingCount = $derived(lists.appData?.counts.upcoming ?? 0);
  const weekCount = $derived(lists.week.length);
  const doneCount = $derived(lists.doneToday.length);
  const isLoading = $derived(lists.loading && !lists.loaded);
  const isEmpty = $derived(!isLoading && tasks.length === 0);

  function groupByGoal(rows: TaskLensListRowDto[]) {
    const byGoal = new Map<string, TaskLensListRowDto[]>();
    for (const t of rows) {
      const key = t.goal?.name ?? "General";
      if (!byGoal.has(key)) byGoal.set(key, []);
      byGoal.get(key)!.push(t);
    }
    // A solo default "General" group renders blank — the heading carries no
    // information.
    const soloGeneral = byGoal.size === 1 && byGoal.has("General");
    return Array.from(byGoal, ([name, items]) => ({
      key: name,
      label: soloGeneral ? "" : name,
      items,
    }));
  }

  const groups = $derived(groupByGoal(tasks.slice(0, todayCap)));
  const doneGroups = $derived(groupByGoal(lists.doneToday));

  function pickTask(task: TaskLensListRowDto) {
    void window.location.assign(`/do/today/${encodeURIComponent(task.permalink ?? task.id)}`);
  }
</script>

<section class="aa-today" aria-label="Today">
  <header class="aa-today__hero">
    <div class="aa-today__hero-copy">
      <div class="aa-eyebrow">Today</div>
      <h1 class="aa-today__title">{isLoading ? "—" : `${tasks.length} of ${todayCap} committed`}</h1>
      <p class="aa-today__subtitle">
        {committedCount >= todayCap
          ? "Day's full. Finish one to make room."
          : "Keep the day small enough to finish."}
      </p>
      <div
        class="aa-today__meter"
        aria-label="{committedCount} of {todayCap} Today slots committed"
      >
        {#each Array.from({ length: todayCap }) as _, i (i)}
          <span
            class="aa-today__meter-dot {i < committedCount ? "aa-today__meter-dot--filled" : ""}"
          ></span>
        {/each}
      </div>
    </div>
    <div class="aa-today__hero-links">
      <CountLinkButton label="This week" count={weekCount} to="/do/week" />
      <CountLinkButton label="Upcoming" count={lists.appData ? upcomingCount : undefined} to="/do/upcoming" />
    </div>
  </header>

  {#if isLoading}
    <div class="aa-today__loading" aria-hidden="true">
      <div class="aa-skeleton aa-skeleton--heading"></div>
      <div class="aa-skeleton aa-skeleton--row"></div>
      <div class="aa-skeleton aa-skeleton--row"></div>
    </div>
  {:else if isEmpty}
    <ListEmpty
      title="Nothing today."
      text="Pull one in from Upcoming, or triage something from the Inbox."
    >
      {#snippet icon()}
        <CompletionCircle size={40} />
      {/snippet}
      {#snippet action()}
        {#if upcomingCount > 0}
          <a href="/do/upcoming" class="aa-btn aa-btn--secondary">See upcoming {upcomingCount}</a>
        {/if}
      {/snippet}
    </ListEmpty>
  {:else}
    {#if overCapacity}
      <div class="aa-today__overflow-banner" role="status">
        <span class="aa-today__overflow-chip">Over capacity</span>
        <span>
          {overflow.length} task{overflow.length === 1 ? "" : "s"} beyond the cap of {todayCap}. Bump
          one to Upcoming or Someday to make room.
        </span>
      </div>
    {/if}

    <GroupedList className="aa-today__list" groups={groups} headingLevel={2}>
      {#snippet renderItem(item)}
        {@const task = item as TaskLensListRowDto}
        <TaskRow
          task={task}
          showLens={showLensPill}
          expanded={activeTaskId === task.id}
          onOpen={() => (activeTaskId = activeTaskId === task.id ? null : task.id)}
        >
          {#snippet below()}
            <RowEditor task={task} onSaved={() => lists.refreshAll()} />
          {/snippet}
        </TaskRow>
      {/snippet}
    </GroupedList>

    {#if overflow.length > 0}
      <ul
        class="aa-grouped__list aa-today__overflow"
        aria-label="Beyond the cap, {overflow.length} task{overflow.length === 1 ? "" : "s"}"
      >
        {#each overflow as task (task.id)}
          <li>
            <TaskRow
              task={task}
              showLens={showLensPill}
              muted
              expanded={activeTaskId === task.id}
              onOpen={() => (activeTaskId = activeTaskId === task.id ? null : task.id)}
            >
              <button
                type="button"
                class="aa-btn aa-btn--ghost"
                title="Start focus on this task"
                onclick={() => pickTask(task)}
              >
                Do
              </button>
            </TaskRow>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#if doneCount > 0}
    <section class="aa-today__done-section" aria-label="Done today">
      <div class="aa-today__done-header">
        <div class="aa-today__done-title">
          <span>Done today</span>
          <span class="aa-today__done-count">{doneCount}</span>
        </div>
        <button
          type="button"
          class="aa-btn aa-btn--ghost"
          aria-expanded={showDone}
          onclick={() => (showDone = !showDone)}
        >
          {showDone ? "Hide" : "Show"}
        </button>
      </div>
      {#if showDone}
        <GroupedList groups={doneGroups} headingLevel={3}>
          {#snippet renderItem(item)}
            {@const task = item as TaskLensListRowDto}
            <TaskRow task={task} showLens={showLensPill} muted>
              <button
                type="button"
                class="aa-btn aa-btn--ghost"
                onclick={() =>
                  feedback.showForTask({ id: task.id, description: task.description })}
              >
                Leave feedback
              </button>
              <a class="aa-btn aa-btn--ghost" href="/do/tasks/{task.permalink ?? task.id}">Open</a>
            </TaskRow>
          {/snippet}
        </GroupedList>
      {/if}
    </section>
  {/if}
</section>

{#if feedback.open}
  <FeedbackDialog />
{/if}

<style>
  .aa-today {
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
  .aa-today__hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .aa-today__title {
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-semibold);
    margin: 0.2rem 0 0;
  }
  .aa-today__subtitle {
    margin: 0.15rem 0 0;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-sm);
  }
  .aa-today__meter {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.7rem;
  }
  .aa-today__meter-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: 1.5px solid var(--aa-teal);
    display: inline-block;
  }
  .aa-today__meter-dot--filled {
    background: var(--aa-teal);
  }
  .aa-today__hero-links {
    display: flex;
    gap: 0.5rem;
  }
  .aa-today__overflow-banner {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    background: var(--aa-amber-soft);
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: var(--aa-text-sm);
    color: var(--aa-text);
  }
  .aa-today__overflow-chip {
    background: var(--aa-amber);
    color: white;
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-semibold);
    flex: none;
  }
  .aa-today__overflow {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .aa-today__done-section {
    border-top: 1px solid var(--aa-border, oklch(0.92 0.004 240));
    padding-top: 1rem;
  }
  .aa-today__done-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .aa-today__done-title {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    font-weight: var(--aa-weight-semibold);
  }
  .aa-today__done-count {
    color: var(--aa-teal-cta);
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
  .aa-btn--ghost {
    background: none;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-btn--ghost:hover {
    color: var(--aa-text);
  }
  .aa-btn--secondary {
    background: transparent;
    border-color: var(--aa-border-strong, oklch(0.85 0.006 240));
  }
</style>
