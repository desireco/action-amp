<script lang="ts">
  // Today — the global committed-for-today list (across all accessible
  // lenses), capped: the first todayCap rows group by Goal; the overflow
  // renders muted under the amber "Over capacity" banner with a "Do" button
  // (the picked-task path). Layout ported from webapp TodayPage.css +
  // ListShell.css: a centered 840px column; the commitment header is a
  // lens-tinted surface card; groups render as surface cards.
  import TaskRow from "../../../lib/components/TaskRow.svelte";
  import GroupedList from "../../../lib/components/ui/GroupedList.svelte";
  import CountLinkButton from "../../../lib/components/ui/CountLinkButton.svelte";
  import ListEmpty from "../../../lib/components/ui/ListEmpty.svelte";
  import CompletionCircle from "../../../lib/components/ui/CompletionCircle.svelte";
  import RowEditor from "../../../lib/components/RowEditor.svelte";
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
      <div class="aa-list-header__eyebrow">Today</div>
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
        <CompletionCircle size="md" />
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

<!-- The feedback dialog is the Shell's now (AppShell parity — one global mount
     of the overlay; the showForTask trigger stays here). -->

<style>
  /* ---- Column: webapp TodayPage.css `.aa-today` — 840px centered. ---- */
  .aa-today {
    width: min(100%, 840px);
    margin: 0 auto;
  }

  /* ---- Commitment header — a lens-tinted surface card (`.aa-today__hero`). */
  .aa-today__hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--aa-space-md);
    padding: var(--aa-space-xl);
    margin-bottom: var(--aa-space-lg);
    background:
      linear-gradient(135deg, var(--aa-active-lens-soft), transparent 58%),
      var(--aa-surface);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-xl);
    box-shadow: var(--aa-shadow-sm);
  }

  .aa-today__hero-copy {
    min-width: 0;
  }

  /* Eyebrow — ListShell.css `.aa-list-header__eyebrow`. */
  .aa-list-header__eyebrow {
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--aa-text-4);
    margin-bottom: var(--aa-space-xs);
  }

  .aa-today__title {
    font-size: var(--aa-text-2xl);
    font-weight: var(--aa-weight-bold);
    letter-spacing: 0;
    color: var(--aa-text);
    margin: 0;
  }

  .aa-today__subtitle {
    max-width: 28rem;
    margin: var(--aa-space-xs) 0 0;
    color: var(--aa-text-3);
    font-size: var(--aa-text-base);
    line-height: var(--aa-leading-snug);
  }

  /* The cap meter — five dashes, filled left to right. */
  .aa-today__meter {
    display: grid;
    grid-template-columns: repeat(5, 24px);
    justify-content: start;
    gap: var(--aa-space-xs);
    margin-top: var(--aa-space-md);
  }

  .aa-today__meter-dot {
    width: 24px;
    height: 6px;
    border-radius: var(--aa-radius-full);
    background: var(--aa-surface-muted-2);
  }

  .aa-today__meter-dot--filled {
    background: var(--aa-teal);
    box-shadow: 0 0 0 1px var(--aa-teal-soft-strong);
  }

  .aa-today__hero-links {
    display: flex;
    align-items: center;
    gap: var(--aa-space-sm);
  }

  /* ---- Groups render as surface cards (TodayPage.css). The GroupedList
     internals are child-component markup, so these reach in via :global. ---- */
  .aa-today :global(.aa-today__list .aa-grouped__group) {
    padding: var(--aa-space-lg);
    background: var(--aa-surface);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-xl);
    box-shadow: var(--aa-shadow-sm);
  }

  .aa-today :global(.aa-today__list .aa-grouped__heading) {
    margin-bottom: var(--aa-space-md);
  }

  .aa-today :global(.aa-today__list .aa-grouped__list) {
    display: flex;
    flex-direction: column;
    gap: var(--aa-space-sm);
  }

  .aa-today :global(.aa-today__list .aa-task-row__title.aa-task-row__title) {
    font-size: var(--aa-text-md);
    font-weight: var(--aa-weight-semibold);
  }

  /* The empty state belongs to Today's committed-work column — it follows the
     same 840px measure instead of the narrower shared empty-state default. */
  .aa-today :global(.aa-list-empty.aa-list-empty) {
    width: 100%;
    max-width: none;
  }

  /* ---- Over-capacity banner (amber = the one human nudge). ---- */
  .aa-today__overflow-banner {
    display: flex;
    align-items: center;
    gap: var(--aa-space-sm);
    flex-wrap: wrap;
    padding: var(--aa-space-md);
    margin-bottom: var(--aa-space-xl);
    background: var(--aa-amber-soft);
    border: 1px solid var(--aa-amber-soft-strong);
    border-radius: var(--aa-radius-sm);
    font-size: var(--aa-text-sm);
    color: var(--aa-amber-text);
    line-height: var(--aa-leading-normal);
  }

  .aa-today__overflow-chip {
    background: var(--aa-amber);
    color: var(--aa-surface);
    border-radius: var(--aa-radius-full);
    padding: 0.1rem 0.55rem;
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-semibold);
    flex: none;
  }

  .aa-today__overflow {
    margin-top: var(--aa-space-xl);
    padding-top: var(--aa-space-xl);
    border-top: 1px solid var(--aa-border);
  }

  /* ---- "Done today" — a plain divider, lighter than a card. ---- */
  .aa-today__done-section {
    margin-top: var(--aa-space-xl);
    padding-top: var(--aa-space-md);
    border-top: 1px solid var(--aa-border);
  }

  .aa-today__done-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--aa-space-sm);
    width: 100%;
    margin-bottom: var(--aa-space-sm);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--aa-text-4);
  }

  .aa-today__done-title {
    display: flex;
    align-items: baseline;
    gap: var(--aa-space-sm);
  }

  .aa-today__done-count {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-medium);
    color: var(--aa-text-4);
  }

  /* ---- Loading skeleton. ---- */
  .aa-today__loading {
    padding: var(--aa-space-md);
  }

  .aa-skeleton {
    border-radius: var(--aa-radius-sm);
    background: var(--aa-surface-muted);
  }

  .aa-skeleton--heading {
    height: 0.8rem;
    width: 7rem;
  }

  .aa-skeleton--row {
    height: 2.5rem;
    margin-top: var(--aa-space-md);
  }

  /* ---- Buttons — webapp Button.css (ghost/secondary, sm). ---- */
  .aa-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--aa-font);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    padding: 6px 12px;
    border: 1px solid transparent;
    border-radius: var(--aa-radius-sm);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    transition:
      background 0.15s var(--aa-ease-out),
      border-color 0.15s var(--aa-ease-out),
      color 0.15s var(--aa-ease-out);
  }

  .aa-btn--ghost {
    background: transparent;
    color: var(--aa-text-2);
  }

  .aa-btn--ghost:hover {
    background: var(--aa-surface-muted);
    color: var(--aa-text);
  }

  .aa-btn--secondary {
    background: var(--aa-surface);
    color: var(--aa-text-2);
    border-color: var(--aa-border-strong);
  }

  .aa-btn--secondary:hover {
    background: var(--aa-surface-muted);
    border-color: var(--aa-border-strong);
    color: var(--aa-text);
  }

  @media (max-width: 720px) {
    .aa-today__hero {
      align-items: stretch;
      flex-direction: column;
      padding: var(--aa-space-lg);
      margin-bottom: var(--aa-space-xl);
    }

    .aa-today__hero-links {
      flex-direction: column;
      align-items: stretch;
    }

    .aa-today__title {
      font-size: var(--aa-text-xl);
    }

    .aa-today :global(.aa-today__list .aa-grouped__group),
    .aa-today__done-section {
      padding: var(--aa-space-md);
    }
  }
</style>
