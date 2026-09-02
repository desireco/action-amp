<script lang="ts">
  /**
   * ProjectDetailView — the /do/projects/:permalink work surface (webapp
   * ProjectDetailPage parity): identity rail + Why (goal) + honest progress
   * band + Next-step hero + horizon-grouped tasks + lifecycle actions behind
   * ⋯ + the explicit delete dispositions.
   *
   * S9 deferral: the Resources section is NOT rendered yet (resources belong
   * to S9) — the payload already carries them, so the section drops in later
   * without contract changes. See s5-s6-wiring.md.
   *
   * Keyboard: forms submit on Enter, Esc closes the shared overlays — the
   * SIMPLE_LIST keyset is that surface's (S4), not this page's.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import "../../styles/Button.css";
  import "../../styles/Overlays.css";
  import "../../styles/projects.css";
  import ConfirmDialog from "../ConfirmDialog.svelte";
  import ListEmpty from "../ListEmpty.svelte";
  import PickerSheet from "../PickerSheet.svelte";
  import BottomSheet from "../BottomSheet.svelte";
  // S9 — the Resources section (webapp ProjectDetailPage parity; closes S5's
  // deferral — see s5-s6-wiring.md §3.3 and docs/plans/slices/s9-wiring.md).
  import ResourceSection from "./ResourceSection.svelte";
  import { projects, formatRelativeDue, SIZE_DURATION, type ProjectDetailTask } from "../../stores/projects.svelte";
  import { goals } from "../../stores/goals.svelte";

  const permalink = $derived($page.params.permalink ?? "");

  let creating = $state(false);
  let taskDescription = $state("");
  let submitting = $state(false);
  let editing = $state(false);
  let editName = $state("");
  let editDesc = $state("");
  let editError = $state<string | null>(null);
  let pickingGoal = $state(false);
  let relinkError = $state<string | null>(null);
  let activeTaskId = $state<string | null>(null);
  let menuOpen = $state(false);
  let movingProject = $state(false);
  let moveTargets = $state<{ id: string; name: string; color: string | null }[]>([]);
  let moveError: string | null = $state(null);
  let confirmComplete = $state(false);
  let confirmArchive = $state(false);
  let confirmDelete = $state(false);
  let deleteTargetProjectId = $state("");
  let reassignTargets = $state<{ id: string; name: string }[]>([]);

  const project = $derived(projects.detail);


  /** Focus the field on mount (autofocus trips the a11y lint; this doesn't). */
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  onMount(() => {
    void projects.loadDetail(permalink);
  });

  // Declined (WONT_DO) tasks have left the project's active surface — they
  // live in the Logbook until restored there.
  const activeTasks = $derived(
    (project?.tasks ?? []).filter((t) => t.status !== "WONT_DO"),
  );

  interface Group {
    key: "TODAY" | "UPCOMING" | "SOMEDAY" | "DONE";
    label: string;
    items: ProjectDetailTask[];
  }

  const groups = $derived.by<Group[]>(() => {
    const today: ProjectDetailTask[] = [];
    const upcoming: ProjectDetailTask[] = [];
    const someday: ProjectDetailTask[] = [];
    const done: ProjectDetailTask[] = [];
    for (const t of activeTasks) {
      const bucket = t.isDone
        ? done
        : t.status === "TODAY"
          ? today
          : t.status === "UPCOMING"
            ? upcoming
            : someday;
      bucket.push(t);
    }
    return [
      { key: "TODAY", label: "Today", items: today },
      { key: "UPCOMING", label: "Upcoming", items: upcoming },
      { key: "SOMEDAY", label: "Someday", items: someday },
      { key: "DONE", label: "Done", items: done },
    ];
  });

  const doneCount = $derived(activeTasks.filter((t) => t.isDone).length);
  const total = $derived(activeTasks.length);
  const progressPct = $derived(total > 0 ? Math.round((doneCount / total) * 100) : 0);
  const openCount = $derived(total - doneCount);
  const todayOpenCount = $derived(
    activeTasks.filter((t) => !t.isDone && t.status === "TODAY").length,
  );
  const doneThisWeek = $derived(
    activeTasks.filter((t) => {
      if (!t.isDone || !t.completedAt) return false;
      return Date.now() - new Date(t.completedAt).getTime() <= 7 * 86_400_000;
    }).length,
  );

  // Next-step hero: the first open Today task (never auto-promotes — Today is
  // a commitment). Exactly-one-Today skips the Today group below.
  const todayTasks = $derived(activeTasks.filter((t) => !t.isDone && t.status === "TODAY"));
  const nextStep = $derived(todayTasks[0] ?? null);
  const hasUpcoming = $derived(activeTasks.some((t) => !t.isDone && t.status === "UPCOMING"));
  const showNoTodayCue = $derived(!nextStep && todayTasks.length === 0 && hasUpcoming);

  async function refresh() {
    await projects.loadDetail(permalink);
  }

  async function openGoalPicker() {
    pickingGoal = true;
    relinkError = null;
    if (project) await goals.loadLens(project.lensId);
  }

  async function handleRelink(goalId: string | null) {
    if (!project) return;
    relinkError = null;
    const ok = await projects.update({ id: project.id, goalId });
    if (!ok) {
      relinkError = projects.error ?? "Couldn't change the goal.";
      projects.error = null;
      return;
    }
    pickingGoal = false;
    await refresh();
  }

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault();
    if (!project || submitting) return;
    submitting = true;
    await projects.addTask(taskDescription);
    submitting = false;
    taskDescription = "";
    creating = false;
  }

  async function setStatus(task: ProjectDetailTask, status: ProjectDetailTask["status"]) {
    await projects.setTaskStatus(task.id, status);
  }

  async function handleStart(task: ProjectDetailTask) {
    // Same loop as the home screen: startTask → /do/focus.
    await projects.startTask(task.id);
    void goto("/do/focus");
  }

  function startEdit() {
    if (!project) return;
    editName = project.name;
    editDesc = project.description ?? "";
    editError = null;
    editing = true;
  }

  async function handleSaveEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!project) return;
    editError = null;
    const ok = await projects.update({
      id: project.id,
      name: editName,
      description: editDesc,
    });
    if (!ok) {
      editError = projects.error ?? "Couldn't save.";
      projects.error = null;
      return;
    }
    editing = false;
    await refresh();
  }

  async function handleComplete() {
    if (!project) return;
    await projects.setDone(project.id, !project.isDone);
    confirmComplete = false;
    // After completing, leave the detail page — the project leaves the active
    // list. Reopen is reachable from the Logbook.
    if (!project.isDone) void goto("/do/projects");
    else await refresh();
  }

  async function handleArchive() {
    if (!project) return;
    await projects.archive(project.id);
    confirmArchive = false;
    void goto("/do/projects");
  }

  async function openMoveSheet() {
    menuOpen = false;
    moveTargets = (await projects.moveTargets()) ?? [];
    movingProject = true;
  }

  async function handleMove(targetLensId: string) {
    if (!project) return;
    const failure = await projects.move(project.id, targetLensId);
    if (failure) {
      // Failure → a confirm-style dialog naming the reason.
      moveError = failure;
      movingProject = false;
      return;
    }
    movingProject = false;
    await refresh();
  }

  async function openDeleteSheet() {
    menuOpen = false;
    confirmDelete = true;
    reassignTargets = (await projects.reassignTargets()) ?? [];
    deleteTargetProjectId = "";
  }

  async function handleDelete(disposition: "delete" | "reassign" | "triage") {
    if (!project) return;
    await projects.remove(
      project.id,
      disposition,
      disposition === "reassign" ? deleteTargetProjectId : undefined,
    );
    confirmDelete = false;
    void goto("/do/projects");
  }
</script>

<div class="aa-detail aa-project">
  {#if projects.busy && !project}
    <p class="aa-state">Loading…</p>
  {:else if projects.error && !project}
    <div class="aa-state aa-state--error" role="alert">{projects.error}</div>
  {:else if !project}
    <p class="aa-state">This project doesn't exist — or isn't yours.</p>
  {:else}
    <!-- Breadcrumb: Projects › [Goal] › Project. Crumb id IS the route. -->
    <nav class="aa-crumbs" aria-label="Breadcrumb">
      <a href="/do/projects">Projects</a>
      {#if project.goal}
        <span class="aa-crumbs__sep" aria-hidden="true">›</span>
        <a href="/do/goals/{project.goal.permalink}">{project.goal.name}</a>
      {/if}
      <span class="aa-crumbs__sep" aria-hidden="true">›</span>
      <span class="aa-crumbs__current">{project.name}</span>
    </nav>

    {#if editing}
      <form class="aa-composer" onsubmit={handleSaveEdit}>
        <h2 class="aa-composer__title">Refine project</h2>
        <p class="aa-composer__subtitle">Keep the outcome concrete. The notes can stay practical.</p>
        <label class="aa-field">
          Project
          <input bind:value={editName} placeholder="Project name" />
        </label>
        <label class="aa-field">
          What makes it done
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
      <header class="aa-project__header">
        <!-- Identity rail — violet is project/goal identity, never the CTA. -->
        <div class="aa-project__rail">
          <span class="aa-project__rail-dot" aria-hidden="true"></span>
          {project.type === "SIMPLE_LIST" ? "List" : "Project"}
        </div>
        <h1 class="aa-project__title">{project.name}</h1>
        {#if project.description}
          <p class="aa-project__desc">{project.description}</p>
        {/if}

        {#if project.type !== "SIMPLE_LIST"}
          <div class="aa-project__why">
            <span class="aa-project__why-eyebrow">Why</span>
            {#if pickingGoal}
              <div class="aa-relink-picker">
                <button
                  type="button"
                  class="aa-project__relink-opt"
                  class:is-active={project.goal === null}
                  onclick={() => handleRelink(null)}
                >
                  None (standalone)
                </button>
                {#each goals.lensGoals as g (g.id)}
                  <button
                    type="button"
                    class="aa-project__relink-opt"
                    class:is-active={project.goal?.id === g.id}
                    onclick={() => handleRelink(g.id)}
                  >
                    {g.name}
                  </button>
                {/each}
                <button
                  type="button"
                  class="aa-btn aa-btn--secondary"
                  onclick={() => (pickingGoal = false)}
                >
                  Cancel
                </button>
                {#if relinkError}
                  <p class="aa-error" role="alert">{relinkError}</p>
                {/if}
              </div>
            {:else if project.goal}
              <div class="aa-project__why-value">
                <a href="/do/goals/{project.goal.permalink}" class="aa-project__why-link">
                  {project.goal.name}
                </a>
                <button type="button" class="aa-project__why-edit" onclick={openGoalPicker}>
                  Edit goal
                </button>
              </div>
            {:else}
              <button type="button" class="aa-project__why-empty" onclick={openGoalPicker}>
                Link a goal →
              </button>
            {/if}
          </div>
        {/if}

        {#if total > 0 || project.dueDate}
          <div class="aa-project__progress">
            {#if total > 0}
              <div class="aa-project__progress-track" role="presentation">
                <div class="aa-project__progress-fill" style:width="{progressPct}%"></div>
              </div>
              <span class="aa-project__progress-label">
                <strong>{doneCount}</strong> of {total} done
              </span>
            {/if}
            {#if project.dueDate}
              <span class="aa-chip aa-chip--teal aa-chip--sm">
                {formatRelativeDue(project.dueDate)}
              </span>
            {/if}
          </div>
        {/if}

        {#if !project.isDone && nextStep}
          <div class="aa-project__next">
            <div class="aa-project__next-eyebrow">Next step</div>
            <div class="aa-project__next-head">
              <h2 class="aa-project__next-title">{nextStep.description}</h2>
            </div>
            <div class="aa-project__next-row">
              <span class="aa-project__next-meta">
                Today
                {#if nextStep.size}
                  <span class="aa-project__next-sep" aria-hidden="true">·</span>
                  {SIZE_DURATION[nextStep.size] ?? nextStep.size}
                {/if}
              </span>
              <button
                type="button"
                class="aa-btn aa-btn--bare aa-project__next-skip"
                onclick={() => setStatus(nextStep, "UPCOMING")}
              >
                Not now
              </button>
              <button
                type="button"
                class="aa-btn aa-btn--primary"
                onclick={() => handleStart(nextStep)}
              >
                Start →
              </button>
            </div>
          </div>
        {/if}

        {#if !project.isDone && showNoTodayCue}
          <p class="aa-project__cue">
            Nothing queued for today. Promote one from Upcoming below.
          </p>
        {/if}

        <div class="aa-project__actions">
          {#if !project.isDone && project.type !== "SIMPLE_LIST"}
            <button
              type="button"
              class="aa-btn aa-btn--primary"
              onclick={() => (creating = !creating)}
            >
              {creating ? "Cancel" : "Add task"}
            </button>
          {/if}
          <button type="button" class="aa-btn aa-btn--bare" onclick={startEdit}>Edit</button>
          <div class="aa-menu-anchor">
            <button
              type="button"
              class="aa-btn aa-btn--bare"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onclick={() => (menuOpen = !menuOpen)}
            >
              Project actions ⋯
            </button>
            {#if menuOpen}
              <div class="aa-menu" role="menu">
                <button type="button" class="aa-menuitem" role="menuitem" onclick={openMoveSheet}>
                  Move
                </button>
                {#if !project.archivedAt && project.type !== "SIMPLE_LIST"}
                  <button
                    type="button"
                    class="aa-menuitem"
                    role="menuitem"
                    onclick={() => {
                      menuOpen = false;
                      if (project.isDone) void handleComplete();
                      else confirmComplete = true;
                    }}
                  >
                    {project.isDone ? "Reopen" : "Complete"}
                  </button>
                {/if}
                {#if !project.archivedAt}
                  <button
                    type="button"
                    class="aa-menuitem"
                    role="menuitem"
                    onclick={() => {
                      menuOpen = false;
                      confirmArchive = true;
                    }}
                  >
                    Archive
                  </button>
                {/if}
                <button
                  type="button"
                  class="aa-menuitem aa-menuitem--danger"
                  role="menuitem"
                  onclick={openDeleteSheet}
                >
                  Delete
                </button>
              </div>
            {/if}
          </div>
        </div>
      </header>
    {/if}

    {#if creating && !project.isDone}
      <form class="aa-create-inline" onsubmit={handleCreate}>
        <input use:focusOnMount bind:value={taskDescription} placeholder="What needs doing?" />
        <button type="submit" class="aa-btn aa-btn--primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          class="aa-btn aa-btn--secondary"
          onclick={() => (creating = false)}
        >
          Cancel
        </button>
      </form>
    {/if}

    {#if total === 0}
      <div class="aa-project__empty">
        <ListEmpty
          title="No tasks yet."
          text="Add the first step — a task lands on Upcoming and shows on Next."
        />
      </div>
    {:else}
      <div class="aa-grouped">
        <div class="aa-project__momentum" aria-label="Project momentum">
          <div class="aa-project__momentum-stat">
            <span class="aa-project__momentum-num">{openCount}</span>
            <span class="aa-project__momentum-label">Open</span>
          </div>
          <div class="aa-project__momentum-stat">
            <span class="aa-project__momentum-num">{doneThisWeek}</span>
            <span class="aa-project__momentum-label">Done this week</span>
          </div>
          <div class="aa-project__momentum-stat">
            <span class="aa-project__momentum-num">{todayOpenCount}</span>
            <span class="aa-project__momentum-label">Today</span>
          </div>
        </div>

        {#each groups as group (group.key)}
          {#if group.items.length > 0}
            {#if !(group.key === "TODAY" && nextStep && group.items.every((t) => t.id === nextStep.id))}
              <section class="aa-project__group" class:aa-project__done-group={group.key === "DONE"}>
                <h3 class="aa-grouped__heading">
                  {group.label}
                  <span class="aa-grouped__count">{group.items.length}</span>
                </h3>
                <ul class="aa-grouped__list">
                  {#each group.items as task (task.id)}
                    <li
                      class="aa-project__row"
                      class:aa-project__row--active={activeTaskId === task.id}
                      class:aa-project__row--done={task.isDone}
                      class:aa-project__row--muted={!task.isDone && task.status === "SOMEDAY"}
                    >
                      <div
                        class="aa-project__row-main"
                        role="button"
                        tabindex="0"
                        onclick={() =>
                          task.isDone
                            ? goto(`/do/tasks/${task.permalink}`)
                            : (activeTaskId = activeTaskId === task.id ? null : task.id)}
                        onkeydown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (task.isDone) goto(`/do/tasks/${task.permalink}`);
                            else activeTaskId = activeTaskId === task.id ? null : task.id;
                          }
                        }}
                      >
                        <span class="aa-project__row-title">{task.description}</span>
                        {#if !task.isDone && task.scheduledDate}
                          <span class="aa-project__row-meta">
                            {formatRelativeDue(task.scheduledDate)}
                          </span>
                        {/if}
                      </div>
                      <div class="aa-project__row-ctrl">
                        {#if !task.isDone}
                          {#each ([["TODAY", "Today"], ["UPCOMING", "Upcoming"], ["SOMEDAY", "Someday"]]) as [status, label] (status)}
                            {#if task.status !== status}
                              <button
                                type="button"
                                class="aa-horizon-btn"
                                onclick={() =>
                                  setStatus(task, status as ProjectDetailTask["status"])}
                              >
                                {label}
                              </button>
                            {/if}
                          {/each}
                        {/if}
                      </div>
                      {#if activeTaskId === task.id && !task.isDone}
                        <div class="aa-project__row-editor">
                          <span class="aa-project__row-meta">
                            {SIZE_DURATION[task.size] ?? task.size}
                          </span>
                          <button
                            type="button"
                            class="aa-btn aa-btn--secondary aa-btn--sm"
                            onclick={() => goto(`/do/tasks/${task.permalink}`)}
                          >
                            Edit on task page
                          </button>
                        </div>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </section>
            {/if}
          {/if}
        {/each}
      </div>
    {/if}

    <!-- S9 — Resources (links, notes, reference material) after the
         actionable work; owns its own sheets + #resource- anchor. -->
    {#if project.type !== "SIMPLE_LIST"}
      <ResourceSection project={project} />
    {/if}
  {/if}
</div>

<!-- Complete confirm (lifecycle confirm copy, webapp parity). -->
{#if confirmComplete && project}
  <ConfirmDialog
    title="Complete this project?"
    message="It will stay in your completed projects list, where you can edit, archive, or delete it. Its tasks will not change."
    confirmLabel="Complete project"
    onConfirm={handleComplete}
    onClose={() => (confirmComplete = false)}
  />
{/if}

<!-- Archive confirm. -->
{#if confirmArchive && project}
  <ConfirmDialog
    title="Archive this project?"
    message="This will complete the project and hide it from your Projects and Logbook. Its task history will be kept."
    confirmLabel="Archive project"
    onConfirm={handleArchive}
    onClose={() => (confirmArchive = false)}
  />
{/if}

<!-- Move sheet (other lenses; empty message per parity). -->
{#if movingProject && project}
  <PickerSheet
    title="Move project to another Lens"
    items={moveTargets.map((lens) => ({ id: lens.id, label: lens.name, meta: "Life area" }))}
    emptyMessage="There are no other Life-area Lenses to move this project to."
    onPick={(id) => handleMove(id)}
    onClose={() => (movingProject = false)}
  />
{/if}

<!-- Move failure dialog. -->
{#if moveError}
  <ConfirmDialog
    title="Couldn't move project"
    message={moveError}
    confirmLabel="Got it"
    cancelLabel={null}
    onConfirm={() => (moveError = null)}
    onClose={() => (moveError = null)}
  />
{/if}

<!-- Delete: explicit task disposition (0 tasks → simple confirm). -->
{#if confirmDelete && project && total === 0}
  <ConfirmDialog
    title="Delete this project?"
    message="This project will be removed. No tasks are in it."
    confirmLabel="Delete project"
    danger
    onConfirm={() => handleDelete("delete")}
    onClose={() => (confirmDelete = false)}
  />
{/if}

{#if confirmDelete && project && total > 0}
  <BottomSheet
    title="What should happen to these tasks?"
    onClose={() => (confirmDelete = false)}
  >
    <div class="aa-project__delete-options">
      <p>
        {total}
        {total === 1 ? "task is" : "tasks are"} still in “{project.name}”.
      </p>
      <button type="button" class="aa-btn aa-btn--danger" onclick={() => handleDelete("delete")}>
        Remove tasks and delete project
      </button>
      <div class="aa-project__delete-reassign">
        <label for="project-delete-target">Move tasks to</label>
        <select id="project-delete-target" bind:value={deleteTargetProjectId}>
          <option value="">Choose a project</option>
          {#each reassignTargets as target (target.id)}
            <option value={target.id}>{target.name}</option>
          {/each}
        </select>
        <button
          type="button"
          class="aa-btn aa-btn--secondary"
          disabled={!deleteTargetProjectId}
          onclick={() => handleDelete("reassign")}
        >
          Move tasks and delete project
        </button>
      </div>
      <button type="button" class="aa-btn aa-btn--secondary" onclick={() => handleDelete("triage")}>
        Send tasks to Triage and delete project
      </button>
    </div>
  </BottomSheet>
{/if}
