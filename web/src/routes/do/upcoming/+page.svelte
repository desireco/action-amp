<script lang="ts">
  // Upcoming — the lens-scoped bench: status=UPCOMING, client-side buckets
  // in fixed order (Overdue / This week / Next week / Later / Snoozed /
  // Unscheduled), overdue recovery banner, Today cross-link.
  import TaskRow from "../../../lib/components/TaskRow.svelte";
  import GroupedList from "../../../lib/components/GroupedList.svelte";
  import CountLinkButton from "../../../lib/components/CountLinkButton.svelte";
  import ListEmpty from "../../../lib/components/ListEmpty.svelte";
  import CompletionCircle from "../../../lib/components/CompletionCircle.svelte";
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
    <div>
      <div class="aa-eyebrow">Upcoming</div>
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
        <CompletionCircle size={40} />
      {/snippet}
      {#snippet action()}
        <a href="/do/inbox" class="aa-btn aa-btn--secondary">Go to Inbox</a>
      {/snippet}
    </ListEmpty>
  {:else}
    <GroupedList groups={groups} headingLevel={2} groupClass={(label) => (label === "Overdue" ? "aa-grouped__group--overdue" : undefined)}>
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
  .aa-upcoming {
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
  .aa-upcoming__hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .aa-upcoming__title {
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-semibold);
    margin: 0.2rem 0 0;
  }
  .aa-upcoming__subtitle {
    margin: 0.15rem 0 0;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-sm);
  }
  .aa-upcoming__overdue-recovery {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    background: var(--aa-rose-soft);
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: var(--aa-text-sm);
    color: var(--aa-rose-text);
    flex-wrap: wrap;
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
  .aa-btn:disabled {
    opacity: 0.55;
  }
  .aa-btn--secondary {
    background: transparent;
    border-color: var(--aa-border-strong, oklch(0.85 0.006 240));
  }
</style>
