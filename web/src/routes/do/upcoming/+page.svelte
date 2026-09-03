<script lang="ts">
  // Upcoming — the lens-scoped bench: status=UPCOMING, client-side buckets
  // in fixed order (Overdue / This week / Next week / Later / Snoozed /
  // Unscheduled), overdue recovery banner, Today cross-link. Layout ported
  // from webapp UpcomingPage.css: 840px column, lens-tinted hero card,
  // groups as surface cards (mirrors Today's treatment).
  import TaskRow from "../../../lib/components/TaskRow.svelte";
  import GroupedList from "../../../lib/components/ui/GroupedList.svelte";
  import CountLinkButton from "../../../lib/components/ui/CountLinkButton.svelte";
  import ListEmpty from "../../../lib/components/ui/ListEmpty.svelte";
  import CompletionCircle from "../../../lib/components/ui/CompletionCircle.svelte";
  import RowEditor from "../../../lib/components/RowEditor.svelte";
  import { untrack } from "svelte";
  import { lists } from "../../../lib/stores/lists.svelte";
  import { lenses } from "../../../lib/stores/lenses.svelte";
  import { calendarDayDifference, currentPlainDate, plainDateFromValue } from "../../../lib/taskView";
  import type { TaskListRowDto } from "../../../lib/dto";

  // The load effect tracks ONLY the shell's active lens: switching lenses in
  // the switcher re-runs it, re-scoping the bench (lists.scopedLensId mirrors
  // it). The loads run untracked — they read+write other store state, which
  // must not re-trigger the effect.
  $effect(() => {
    void lenses.activeLensId;
    untrack(() => {
      lists.loaded = false;
      void lists.loadLensList("UPCOMING");
      void lists.loadAppData();
    });
  });

  let activeTaskId = $state<string | null>(null);
  let isUnscheduling = $state(false);

  const tasks = $derived(lists.upcoming);
  const isLoading = $derived(lists.loading && !lists.loaded);
  const lensId = $derived(lists.scopedLensId);

  const groups = $derived.by(() => {
    const buckets: Record<string, TaskListRowDto[]> = {
      Overdue: [],
      "This week": [],
      "Next week": [],
      Later: [],
      Snoozed: [],
      Unscheduled: [],
    };
    const today = currentPlainDate();
    for (const t of tasks) {
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

  const count = $derived(tasks.length);
  const overdueCount = $derived(groups.find((g) => g.key === "Overdue")?.items.length ?? 0);

  const heroSubtitle = $derived.by(() => {
    if (isLoading) return "Tasks with a future date land here.";
    if (overdueCount > 0) return `${overdueCount} overdue — these slipped past their date.`;
    if (count === 0) return "Tasks with a future date land here.";
    return "The bench. Snoozed or scheduled — pull one onto Today when it's time.";
  });

  async function unscheduleOverdue() {
    if (!lensId || overdueCount === 0) return;
    isUnscheduling = true;
    try {
      await lists.unscheduleOverdue();
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
    <CountLinkButton label="Today" count={lists.appData?.counts.today} to="/do/today" />
  </header>

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
        <a href="/do/inbox" class="aa-btn aa-btn--secondary">Go to Inbox</a>
      {/snippet}
    </ListEmpty>
  {:else}
    <GroupedList className="aa-upcoming__list" groups={groups} headingLevel={2} groupClass={(label) => (label === "Overdue" ? "aa-grouped__group--overdue" : undefined)}>
      {#snippet renderItem(item)}
        {@const task = item as TaskListRowDto}
        <TaskRow
          task={task}
          expanded={activeTaskId === task.id}
          onOpen={() => (activeTaskId = activeTaskId === task.id ? null : task.id)}
        >
          {#snippet below()}
            <RowEditor
              task={task}
              lensId={lensId}
              onSaved={() => lists.loadLensList("UPCOMING")}
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
