<script lang="ts">
  // Upcoming — the GLOBAL bench (WORKFLOW.md §2.4/§5.1, revised 2026-09-24
  // #10): every accessible lens's status=UPCOMING tasks in one surface, lens
  // pills on rows, an All / per-lens filter. Client-side buckets in fixed
  // order (Overdue / This week / Next week / Later / Snoozed / Unscheduled),
  // overdue recovery banner, Today cross-link. Layout ported from webapp
  // UpcomingPage.css: 840px column, lens-tinted hero card, groups as surface
  // cards (mirrors Today's treatment).
  import TaskRow from "../../lib/components/TaskRow.svelte";
  import GroupedList from "../../lib/components/ui/GroupedList.svelte";
  import CountLinkButton from "../../lib/components/ui/CountLinkButton.svelte";
  import ListEmpty from "../../lib/components/ui/ListEmpty.svelte";
  import CompletionCircle from "../../lib/components/ui/CompletionCircle.svelte";
  import RowEditor from "../../lib/components/RowEditor.svelte";
  import { untrack } from "svelte";
  import { lists } from "../../lib/stores/lists.svelte";
  import { calendarDayDifference, currentPlainDate, plainDateFromValue } from "../../lib/taskView";
  import type { TaskLensListRowDto, TaskListRowDto } from "../../lib/dto";

  // One load on mount — the bench is universal (#10): the shell's lens
  // switcher no longer re-scopes this page. The load runs untracked (it
  // reads+writes other store state, which must not re-trigger the effect).
  $effect(() => {
    untrack(() => {
      lists.loaded = false;
      void lists.loadUpcomingAll();
      void lists.loadAppData();
    });
  });

  let activeTaskId = $state<string | null>(null);
  let isUnscheduling = $state(false);
  /** The context filter (#10): null = All lenses. */
  let lensFilter = $state<string | null>(null);

  const tasks = $derived(lists.upcoming);
  const lensOptions = $derived(lists.appData?.lenses ?? []);
  const filtered = $derived(
    lensFilter ? tasks.filter((t) => t.lens?.id === lensFilter) : tasks,
  );
  const lensCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (!t.lens) continue;
      counts.set(t.lens.id, (counts.get(t.lens.id) ?? 0) + 1);
    }
    return counts;
  });
  const isLoading = $derived(lists.loading && !lists.loaded);
  const lensId = $derived(lists.scopedLensId);

  const groups = $derived.by(() => {
    const buckets: Record<string, TaskLensListRowDto[]> = {
      Overdue: [],
      "This week": [],
      "Next week": [],
      Later: [],
      Snoozed: [],
      Unscheduled: [],
    };
    const today = currentPlainDate();
    for (const t of filtered) {
      if (!t.scheduledDate) {
        if (t.snoozedUntil) {
          buckets["Snoozed"]!.push(t);
          continue;
        }
        buckets["Unscheduled"]!.push(t);
        continue;
      }
      const diffDays = calendarDayDifference(today, plainDateFromValue(t.scheduledDate));
      if (diffDays < 0) buckets["Overdue"]!.push(t);
      else if (diffDays <= 7) buckets["This week"]!.push(t);
      else if (diffDays <= 14) buckets["Next week"]!.push(t);
      else buckets["Later"]!.push(t);
    }
    return Object.entries(buckets).map(([label, items]) => ({ key: label, label, items }));
  });

  const count = $derived(filtered.length);
  const overdueCount = $derived(groups.find((g) => g.key === "Overdue")?.items.length ?? 0);

  const heroSubtitle = $derived.by(() => {
    if (isLoading) return "Tasks with a future date land here.";
    if (overdueCount > 0) return `${overdueCount} overdue — these slipped past their date.`;
    if (count === 0) return "Tasks with a future date land here.";
    return "The bench. Snoozed or scheduled — pull one onto Today when it's time.";
  });

  async function unscheduleOverdue() {
    // The bench spans lenses (#10): clear the overdue in every lens the
    // current filter shows.
    const overdueLensIds = [
      ...new Set(
        groups
          .find((g) => g.key === "Overdue")
          ?.items.map((t) => t.lens?.id)
          .filter((id): id is string => !!id) ?? [],
      ),
    ];
    if (overdueLensIds.length === 0) return;
    isUnscheduling = true;
    try {
      await lists.unscheduleOverdue(overdueLensIds);
    } finally {
      isUnscheduling = false;
    }
  }
</script>

<section class="aa-upcoming" aria-label="Upcoming">
  <header class="aa-upcoming__hero">
    <div class="aa-upcoming__hero-copy">
      <div class="aa-list-header__eyebrow">Upcoming</div>
      <h1 class="aa-upcoming__title">{isLoading ? "—" : `${count} on the bench`}</h1>
      <p class="aa-upcoming__subtitle">{heroSubtitle}</p>
    </div>
    <CountLinkButton label="Today" count={lists.appData?.counts.today} to="/today" />
  </header>

  {#if !isLoading && lensOptions.length > 1}
    <div class="aa-upcoming__filter" role="radiogroup" aria-label="Filter by lens">
      <button
        type="button"
        role="radio"
        aria-checked={lensFilter === null}
        class="aa-filter-chip {lensFilter === null ? "active" : ""}"
        onclick={() => (lensFilter = null)}
      >All · {tasks.length}</button>
      {#each lensOptions as l (l.id)}
        {@const n = lensCounts.get(l.id) ?? 0}
        {#if n > 0}
          <button
            type="button"
            role="radio"
            aria-checked={lensFilter === l.id}
            class="aa-filter-chip {lensFilter === l.id ? "active" : ""}"
            onclick={() => (lensFilter = l.id)}
          >{l.name} · {n}</button>
        {/if}
      {/each}
    </div>
  {/if}

  {#if overdueCount > 0}
    <div class="aa-upcoming__overdue-recovery" role="status">
      <span>Clear past dates. Tasks stay on the bench without an overdue label.</span>
      <button type="button" class="aa-btn aa-btn--secondary" disabled={isUnscheduling} onclick={() => void unscheduleOverdue()}>
        {isUnscheduling ? "Unscheduling…" : `Unschedule ${overdueCount} overdue`}
      </button>
    </div>
  {/if}

  {#if isLoading}
    <div class="aa-upcoming__loading" aria-hidden="true">
      <div class="aa-skeleton aa-skeleton--heading"></div>
      <div class="aa-skeleton aa-skeleton--row"></div>
      <div class="aa-skeleton aa-skeleton--row"></div>
    </div>
  {:else if count === 0}
    <ListEmpty
      title="Nothing upcoming."
      text="Tasks with a future date land here. Add a due date from triage or edit a task to schedule it."
    >
      {#snippet icon()}
        <CompletionCircle size="lg" />
      {/snippet}
      {#snippet action()}
        <a href="/inbox" class="aa-btn aa-btn--secondary">Go to Inbox</a>
      {/snippet}
    </ListEmpty>
  {:else}
    <GroupedList className="aa-upcoming__list" groups={groups} headingLevel={2} groupClass={(label) => (label === "Overdue" ? "aa-grouped__group--overdue" : undefined)}>
      {#snippet renderItem(item)}
        {@const task = item as TaskLensListRowDto}
        <TaskRow
          task={task}
          showLens={lists.showLensPill}
          expanded={activeTaskId === task.id}
          onOpen={() => (activeTaskId = activeTaskId === task.id ? null : task.id)}
        >
          {#snippet below()}
            <RowEditor
              task={task}
              lensId={task.lens?.id ?? lensId}
              onSaved={() => lists.loadUpcomingAll()}
            />
          {/snippet}
        </TaskRow>
      {/snippet}
    </GroupedList>
  {/if}
</section>

<style>
  /* ---- Column: webapp UpcomingPage.css `.aa-upcoming` — 840px centered. */
  .aa-upcoming {
    width: min(100%, 840px);
    margin: 0 auto;
  }

  /* ---- Context filter (#10): quiet chips; teal = selection (the system
     state color). Only lenses with bench work render. ---- */
  .aa-upcoming__filter {
    display: flex;
    flex-wrap: wrap;
    gap: var(--aa-space-xs);
    margin-bottom: var(--aa-space-md);
  }

  :global(.aa-filter-chip) {
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-full);
    background: var(--aa-surface);
    color: var(--aa-text-2);
    font: inherit;
    font-size: var(--aa-text-sm);
    cursor: pointer;
    transition: border-color 0.15s var(--aa-ease-out), color 0.15s var(--aa-ease-out);
  }

  :global(.aa-filter-chip:hover) {
    border-color: var(--aa-border-strong);
    color: var(--aa-text);
  }

  :global(.aa-filter-chip:focus-visible) {
    outline: 2px solid var(--aa-teal);
    outline-offset: 2px;
  }

  :global(.aa-filter-chip.active) {
    border-color: var(--aa-teal);
    color: var(--aa-teal);
    background: var(--aa-teal-soft);
  }

  /* ---- Bench header — a lens-tinted surface card (mirrors Today's hero). */
  .aa-upcoming__hero {
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

  .aa-upcoming__hero-copy {
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

  .aa-upcoming__title {
    font-size: var(--aa-text-2xl);
    font-weight: var(--aa-weight-bold);
    letter-spacing: 0;
    color: var(--aa-text);
    margin: 0;
  }

  .aa-upcoming__subtitle {
    max-width: 32rem;
    margin: var(--aa-space-xs) 0 0;
    color: var(--aa-text-3);
    font-size: var(--aa-text-base);
    line-height: var(--aa-leading-snug);
  }

  /* ---- Groups render as surface cards (UpcomingPage.css); GroupedList
     internals are child-component markup, so these reach in via :global. */
  .aa-upcoming :global(.aa-upcoming__list .aa-grouped__group) {
    padding: var(--aa-space-lg);
    background: var(--aa-surface);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-xl);
    box-shadow: var(--aa-shadow-sm);
  }

  .aa-upcoming :global(.aa-upcoming__list .aa-grouped__heading) {
    margin-bottom: var(--aa-space-md);
  }

  .aa-upcoming :global(.aa-upcoming__list .aa-grouped__list) {
    display: flex;
    flex-direction: column;
    gap: var(--aa-space-sm);
  }

  /* The Overdue bucket is a contradiction on a forward-looking list — rose. */
  .aa-upcoming :global(.aa-upcoming__list .aa-grouped__group--overdue .aa-grouped__heading),
  .aa-upcoming :global(.aa-upcoming__list .aa-grouped__group--overdue .aa-grouped__count) {
    color: var(--aa-rose-text);
  }

  /* ---- Overdue recovery (UpcomingPage.css `.aa-upcoming__overdue-recovery`). */
  .aa-upcoming__overdue-recovery {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--aa-space-md);
    padding: var(--aa-space-sm) var(--aa-space-md);
    margin: 0 0 var(--aa-space-lg);
    color: var(--aa-text-2);
    font-size: var(--aa-text-sm);
    background: var(--aa-surface);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-lg);
  }

  /* ---- Loading skeleton. ---- */
  .aa-upcoming__loading {
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

  /* ---- Buttons — webapp Button.css (secondary, sm). ---- */
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

  .aa-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .aa-btn--secondary {
    background: var(--aa-surface);
    color: var(--aa-text-2);
    border-color: var(--aa-border-strong);
  }

  .aa-btn--secondary:hover:not(:disabled) {
    background: var(--aa-surface-muted);
    border-color: var(--aa-border-strong);
    color: var(--aa-text);
  }

  @media (max-width: 720px) {
    .aa-upcoming__hero {
      align-items: stretch;
      flex-direction: column;
      padding: var(--aa-space-lg);
      margin-bottom: var(--aa-space-xl);
    }

    .aa-upcoming__hero :global(.aa-btn) {
      width: 100%;
    }

    .aa-upcoming__title {
      font-size: var(--aa-text-xl);
    }

    .aa-upcoming__overdue-recovery {
      align-items: stretch;
      flex-direction: column;
    }

    .aa-upcoming :global(.aa-upcoming__list .aa-grouped__group) {
      padding: var(--aa-space-md);
    }
  }
</style>
