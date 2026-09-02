<script lang="ts">
  // TaskRow — the universal task list row (webapp ui/TaskRow port). Title
  // leads, meta chips wrap below, status is a leading dot, hover-revealed
  // action slot on the right, and the expanded `below` slot hosts the
  // TaskRowEditor. No completion control — completing happens in focus.
  import type { Snippet } from "svelte";
  import Chip from "./Chip.svelte";
  import { formatDueChip } from "../taskView";
  import type { TaskListRowDto } from "../dto";

  /** A list row, optionally carrying its lens (global Today/Done pills). */
  type TaskRowTask = TaskListRowDto & {
    lens?: { id: string; name: string; color: string | null } | null;
  };

  let {
    task,
    muted = false,
    onOpen,
    expanded = false,
    showLens = false,
    children,
    below,
  }: {
    task: TaskRowTask;
    muted?: boolean;
    onOpen?: (task: TaskRowTask) => void;
    expanded?: boolean;
    showLens?: boolean;
    children?: Snippet;
    below?: Snippet;
  } = $props();

  const done = $derived(task.isDone);
  const hasChildren = $derived(!!children);

  function dotClass(): string | null {
    if (task.isDone) return "aa-task-row__dot--done";
    switch (task.status) {
      case "TODAY":
        return "aa-task-row__dot--today";
      case "UPCOMING":
        return "aa-task-row__dot--upcoming";
      case "SOMEDAY":
        return "aa-task-row__dot--someday";
      default:
        return null;
    }
  }

  const dot = $derived(dotClass());
  // The due chip is bench scheduling signal; a committed (TODAY) row never
  // renders it — one field may say "today" (mirrors the server rule).
  const due = $derived(
    task.scheduledDate && task.status !== "TODAY" ? formatDueChip(task.scheduledDate) : null,
  );
  const showLensPill = $derived(showLens && !!task.lens);
  const hasMeta = $derived(
    task.priority === "IMPORTANT" || !!task.project || !!due || !!task.size,
  );
  const interactive = $derived(!!onOpen);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_click_events_have_key_events -->
<div
  class="aa-task-row {muted ? "aa-task-row--muted" : ""} {done ? "aa-task-row--done" : ""} {interactive
    ? "aa-task-row--clickable"
    : ""} {below && expanded ? "aa-task-row--has-below" : ""}"
  role={interactive ? "button" : undefined}
  tabindex={interactive ? 0 : undefined}
  aria-expanded={interactive && below ? expanded : undefined}
  onclick={interactive ? () => onOpen?.(task) : undefined}
  onkeydown={(e) => {
    if (interactive && e.key === "Enter") onOpen?.(task);
  }}
>
  {#if dot}
    <span class="aa-task-row__dot {dot}" aria-hidden="true">{done ? "✓" : ""}</span>
  {/if}
  <div class="aa-task-row__main" class:aa-task-row__main--split={hasChildren}>
    <span class="aa-task-row__title">
      {#if showLensPill && task.lens}
        <span class="aa-task-row__lens" title="Lens: {task.lens.name}">
          <span class="aa-task-row__lens-dot" aria-hidden="true"></span>
          {task.lens.name}
        </span>
      {/if}
      {task.description}
    </span>
    {#if hasMeta && !(below && expanded)}
      <div class="aa-task-row__meta">
        {#if task.priority === "IMPORTANT"}
          <Chip variant="amber" small>★</Chip>
        {/if}
        {#if task.project}
          <Chip variant="violet" small>{task.project.name}</Chip>
        {/if}
        {#if due}
          <Chip variant={due.overdue ? "rose" : "teal"} small>{due.label}</Chip>
        {/if}
        {#if task.size}
          <Chip variant="muted" small>{task.size}</Chip>
        {/if}
      </div>
    {/if}
  </div>
  {#if children}
    <div class="aa-task-row__actions" onclick={(e) => e.stopPropagation()} role="presentation">
      {@render children()}
    </div>
  {/if}
  {#if below && expanded}
    <div class="aa-task-row__below">{@render below()}</div>
  {/if}
</div>

<style>
  .aa-task-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.6rem 0.35rem;
    border-radius: 8px;
  }
  .aa-task-row--clickable {
    cursor: pointer;
  }
  .aa-task-row--clickable:hover {
    background: var(--aa-surface-muted, oklch(0.97 0.004 240));
  }
  .aa-task-row--muted,
  .aa-task-row--muted .aa-task-row__title {
    color: var(--aa-text-muted, oklch(0.52 0.01 240));
  }
  .aa-task-row__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .aa-task-row__title {
    font-size: var(--aa-text-base);
    color: var(--aa-text);
  }
  .aa-task-row--done .aa-task-row__title {
    text-decoration: line-through;
  }
  .aa-task-row__dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
  }
  .aa-task-row__dot--today {
    background: var(--aa-teal);
  }
  .aa-task-row__dot--upcoming {
    border: 1.5px solid var(--aa-teal);
  }
  .aa-task-row__dot--someday {
    border: 1.5px solid var(--aa-border-strong, oklch(0.8 0.006 240));
  }
  .aa-task-row__dot--done {
    background: var(--aa-teal-cta);
    color: white;
  }
  .aa-task-row__meta {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .aa-task-row__lens {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin-right: 0.4rem;
  }
  .aa-task-row__lens-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--aa-accent, var(--aa-teal));
    box-shadow: var(--aa-ring-halo);
  }
  .aa-task-row__actions {
    display: flex;
    gap: 0.35rem;
    flex: none;
  }
  .aa-task-row__below {
    flex-basis: 100%;
    padding: 0.5rem 0.25rem 0.75rem;
  }
  .aa-task-row--has-below {
    flex-wrap: wrap;
    background: var(--aa-surface-muted, oklch(0.97 0.004 240));
  }
</style>
