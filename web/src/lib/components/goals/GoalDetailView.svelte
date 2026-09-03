<script lang="ts">
  /**
   * GoalDetailView — the /do/goals/:permalink surface (webapp GoalDetailPage
   * parity): header meta (done/total + %), the "Focus: <project>" line,
   * linked-projects list with ↑/↓ sequence editing, inline edit, Complete /
   * Reopen (no confirm), and the lossless delete confirm with the
   * "N item(s) will move to standalone" copy.
   *
   * Focus advancement is derived, not written: completing the focused project
   * promotes the next in sequence on the next read.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import "../ui/Button.css";
  import "../ui/Overlays.css";
  import "../../styles/projects.css";
  import "../../styles/goals.css";
  import { goals } from "../../stores/goals.svelte";
  import { formatRelativeDue } from "../../stores/projects.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Chip from "../ui/Chip.svelte";

  const permalink = $derived($page.params.permalink ?? "");

  let editing = $state(false);
  let editName = $state("");
  let editDesc = $state("");
  let editError = $state<string | null>(null);
  let confirmDelete = $state(false);
  let reordering = $state(false);
  let loaded = $state(false);

  onMount(async () => {
    await goals.loadDetail(permalink);
    loaded = true;
  });

  const goal = $derived(goals.detail);

  // Aggregate progress — MUST match getGoals' rollup so the list-card % and
  // this header % agree.
  const rollup = $derived.by(() => {
    if (!goal) return { progress: 0, totalItems: 0, doneItems: 0 };
    const projectsDone = goal.projects.filter((p) => p.isDone).length;
    const projectsTotal = goal.projects.length;
    return {
      progress: projectsTotal === 0 ? 0 : Math.round((projectsDone / projectsTotal) * 100),
      totalItems: projectsTotal,
      doneItems: projectsDone,
    };
  });

  // "Focus" project — first non-done in sequence order (spec §E). Absent when
  // all projects are done or there are none — no fabricated content.
  const nextProject = $derived(goal?.projects.find((p) => !p.isDone) ?? null);

  async function handleComplete() {
    if (!goal) return;
    await goals.setDone(goal.id, !goal.isDone);
    // After completing, leave the detail page — the goal leaves the active
    // list. Reopen stays reachable from the Logbook.
    if (!goal.isDone) void goto("/do/goals");
    else await goals.loadDetail(permalink);
  }

  function startEdit() {
    if (!goal) return;
    editName = goal.name;
    editDesc = goal.description ?? "";
    editError = null;
    editing = true;
  }

  async function handleSaveEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!goal) return;
    editError = null;
    const failure = await goals.update({ id: goal.id, name: editName, description: editDesc });
    if (failure) {
      editError = failure;
      return;
    }
    editing = false;
    await goals.loadDetail(permalink);
  }

  async function handleDelete() {
    if (!goal) return;
    await goals.remove(goal.id);
    confirmDelete = false;
    void goto("/do/goals");
  }

  // Reorder: swap a project with its neighbor and write the FULL new order
  // (order = index for each). Buttons disabled at the boundary + in flight.
  async function handleReorder(index: number, direction: -1 | 1) {
    if (!goal || reordering) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= goal.projects.length) return;
    const orderedIds = goal.projects.map((p) => p.id);
    [orderedIds[index], orderedIds[newIndex]] = [orderedIds[newIndex], orderedIds[index]];
    reordering = true;
    try {
      await goals.reorder(goal.id, orderedIds);
      await goals.loadDetail(permalink);
    } finally {
      reordering = false;
    }
  }

  // Counts for the delete confirm copy: "N item(s) will move to standalone."
  const childCount = $derived(goal?.projects.length ?? 0);
</script>

<div class="aa-detail aa-goal">
  {#if !loaded && !goal}
    <p class="aa-state">Loading…</p>
  {:else if goals.error && !goal}
    <div class="aa-state aa-state--error" role="alert">Couldn't load this goal.</div>
  {:else if !goal}
    <p class="aa-state">This goal doesn't exist — or isn't yours.</p>
  {:else}
    <!-- Breadcrumb: Goals list › this goal. Crumb id IS the destination route. -->
    <nav class="aa-crumbs" aria-label="Breadcrumb">
      <a href="/do/goals">Goals</a>
      <span class="aa-crumbs__sep" aria-hidden="true">›</span>
      <span class="aa-crumbs__current">{goal.name}</span>
    </nav>

    {#if editing}
      <form class="aa-composer" onsubmit={handleSaveEdit}>
        <h2 class="aa-composer__title">Refine goal</h2>
        <p class="aa-composer__subtitle">Keep the outcome clear. The why can stay plain.</p>
        <label class="aa-field">
          Outcome
          <input bind:value={editName} placeholder="Goal name" />
        </label>
        <label class="aa-field">
          Why this matters
          <input bind:value={editDesc} placeholder="Description (optional)" />
        </label>
        {#if editError}
          <p class="aa-error" role="alert">{editError}</p>
        {/if}
        <div class="aa-composer__actions">
          <button type="button" class="aa-btn aa-btn--secondary" onclick={() => (editing = false)}>
            Cancel
          </button>
          <button type="submit" class="aa-btn aa-btn--primary">Save</button>
        </div>
      </form>
    {:else}
      <header class="aa-goal__header">
        <div class="aa-goal__header-main">
          <div class="aa-project__rail">
            <span class="aa-project__rail-dot" aria-hidden="true"></span>
            Goal
          </div>
          <h1 class="aa-project__title">{goal.name}</h1>
          {#if rollup.totalItems > 0}
            <p class="aa-goal__meta">
              {rollup.doneItems}/{rollup.totalItems} done · {rollup.progress}%
            </p>
          {/if}
          {#if nextProject}
            <p class="aa-goal__next">
              Focus:
              <a href="/do/projects/{nextProject.permalink}">{nextProject.name}</a>
            </p>
          {/if}
        </div>
        <div class="aa-goal__actions">
          <button type="button" class="aa-btn aa-btn--secondary" onclick={startEdit}>Edit</button>
          <button type="button" class="aa-btn aa-btn--secondary" onclick={handleComplete}>
            {goal.isDone ? "Reopen" : "Complete"}
          </button>
          <button
            type="button"
            class="aa-btn aa-btn--danger"
            onclick={() => (confirmDelete = true)}
          >
            Delete
          </button>
        </div>
      </header>

      {#if goal.description}
        <p class="aa-goal__desc">{goal.description}</p>
      {/if}
    {/if}

    <!-- Linked projects — the only surface with sequence editing (spec §E). -->
    {#if goal.projects.length > 0}
      <section class="aa-goal__projects">
        <h3 class="aa-grouped__heading">
          Projects <span class="aa-grouped__count">{goal.projects.length}</span>
        </h3>
        <ul class="aa-grouped__list">
          {#each goal.projects as p, index (p.id)}
            {@const pDone = p.tasks.filter((t) => t.isDone).length}
            {@const pTotal = p.tasks.length}
            {@const pct = pTotal === 0 ? 0 : Math.round((pDone / pTotal) * 100)}
            <li class="aa-goal__project-row">
              <div class="aa-goal__project-reorder">
                <button
                  type="button"
                  class="aa-reorder-btn"
                  disabled={reordering || index === 0}
                  onclick={() => handleReorder(index, -1)}
                  aria-label="Move {p.name} up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="aa-reorder-btn"
                  disabled={reordering || index === goal.projects.length - 1}
                  onclick={() => handleReorder(index, 1)}
                  aria-label="Move {p.name} down"
                >
                  ↓
                </button>
              </div>
              <a href="/do/projects/{p.permalink}" class="aa-goal__project-link">
                <span class="aa-goal__project-name">{p.name}</span>
                {#if p.isDone}
                  <Chip variant="muted" small>Done</Chip>
                {/if}
                {#if pTotal > 0}
                  <span class="aa-goal__project-pct">{pct}%</span>
                {/if}
                {#if p.dueDate}
                  <span class="aa-chip aa-chip--teal aa-chip--sm">
                    {formatRelativeDue(p.dueDate)}
                  </span>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <section class="aa-goal__projects-empty">
        <h2>No supporting projects yet.</h2>
        <p>Assign projects to this goal from their Project detail page.</p>
      </section>
    {/if}
  {/if}
</div>

<!-- Delete confirm — lossless re-parenting copy (webapp parity). -->
{#if confirmDelete && goal}
  <ConfirmDialog
    title="Delete this goal?"
    message={
      childCount > 0
        ? `${childCount} ${childCount === 1 ? "item" : "items"} will move to standalone in this Lens. The goal itself will be removed.`
        : "This goal will be removed. No items are linked to it."
    }
    confirmLabel="Delete goal"
    danger
    onConfirm={handleDelete}
    onClose={() => (confirmDelete = false)}
  />
{/if}
