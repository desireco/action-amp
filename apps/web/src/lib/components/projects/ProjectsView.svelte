<script lang="ts">
  /**
   * ProjectsView — the /do/projects surface (webapp ProjectsPage parity).
   * Active cards + collapsible completed/archived sections + create composer
   * with two kinds (project / simple list) + the ProGate panel on a 402.
   * Styles: ../styles/projects.css (shared planning-surface classes).
   */
  import { onMount } from "svelte";
  import "../../styles/projects.css";
  import {
    projects,
    formatRelativeDue,
    type GateMessage,
    type ProjectSummary,
  } from "../../stores/projects.svelte";
  import ProgressCard from "./ProgressCard.svelte";

  let creating = $state(false);
  let submitting = $state(false);
  let gate = $state<GateMessage | null>(null);
  let createError = $state<string | null>(null);
  let name = $state("");
  let description = $state("");
  let kind = $state<"project" | "list">("project");
  let showCompleted = $state(false);
  let showArchived = $state(false);


  /** Focus the field on mount (autofocus trips the a11y lint; this doesn't). */
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  onMount(() => {
    void projects.load();
  });

  const active = $derived(projects.projects.filter((p) => !p.isDone && !p.archivedAt));
  const completed = $derived(projects.projects.filter((p) => p.isDone && !p.archivedAt));
  const archived = $derived(projects.projects.filter((p) => !!p.archivedAt));
  const isEmpty = $derived(projects.loaded && projects.projects.length === 0);

  function cardProps(p: ProjectSummary) {
    const isList = p.type === "SIMPLE_LIST";
    const total = isList ? p.openItems + p.checkedItems : p.openCount + p.doneCount;
    const done = isList ? p.checkedItems : p.doneCount;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return {
      href: `/do/projects/${p.permalink}`,
      title: p.name,
      description: p.description,
      progress: pct,
      progressLabel: isList
        ? `${p.checkedItems}/${total} checked`
        : `${p.doneCount}/${total} done`,
      meta: isList
        ? ["List", `${p.openItems} open`]
        : [p.goal?.name ?? "Standalone", `${p.openCount} open`, `${p.doneCount} done`],
      dueLabel: p.dueDate ? formatRelativeDue(p.dueDate) : null,
      focusLabel: isList ? "List" : p.nextAction ? "Focus" : "Status",
      focusValue: isList
        ? "Check items off directly"
        : (p.nextAction?.description ?? "No next action"),
      focusTone: (isList || !p.nextAction ? "muted" : "amber") as "muted" | "amber",
      kind: p.type,
    };
  }

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    gate = null;
    createError = null;
    const result = await projects.create({
      name,
      description: description || undefined,
      type: kind === "list" ? "SIMPLE_LIST" : "STANDARD",
    });
    submitting = false;
    if (!result.ok) {
      // Entitlement: a 402 from the cap guard becomes a paywall moment.
      gate = result.gate;
      if (!gate) createError = result.message;
      return;
    }
    creating = false;
    name = "";
    description = "";
    kind = "project";
  }

  function handleKeydown(event: KeyboardEvent) {
    // Esc closes the topmost local surface (composer first, then sections).
    if (event.key === "Escape" && creating) {
      creating = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="aa-projects">
  <header class="aa-list-header">
    <div>
      <div class="aa-list-header__eyebrow">Planning</div>
      <h1 class="aa-list-header__title">Projects</h1>
      <p class="aa-list-header__description">
        {#if projects.busy && !projects.loaded}
          Loading projects…
        {:else}
          {active.length} active · Outcomes that need more than one step.
        {/if}
      </p>
    </div>
    <button type="button" class="aa-create-control" onclick={() => (creating = !creating)}>
      {creating ? "Close" : "New project"}
    </button>
  </header>

  {#if gate}
    <div class="aa-pro-gate" role="alert">
      <p class="aa-pro-gate__title">{gate.feature} is a Pro feature.</p>
      <p class="aa-pro-gate__reason">{gate.reason}.</p>
    </div>
  {/if}

  {#if creating}
    <form class="aa-composer" onsubmit={handleCreate}>
      <h2 class="aa-composer__title">New project</h2>
      <p class="aa-composer__subtitle">Name the outcome. Add the shape of done if it helps.</p>
      <div class="aa-composer__kinds" role="group" aria-label="Project kind">
        <button
          type="button"
          class="aa-kind"
          class:active={kind === "project"}
          onclick={() => (kind = "project")}
        >
          <span class="aa-kind__label">Project</span>
          <span class="aa-kind__hint">Tasks, focus, and progress.</span>
        </button>
        <button
          type="button"
          class="aa-kind"
          class:active={kind === "list"}
          onclick={() => (kind = "list")}
        >
          <span class="aa-kind__label">Simple list</span>
          <span class="aa-kind__hint">Add items directly and check them off.</span>
        </button>
      </div>
      <label class="aa-field">
        Project
        <input use:focusOnMount bind:value={name} placeholder="Ship product v2" />
      </label>
      <label class="aa-field">
        What makes it done
        <input
          bind:value={description}
          placeholder="The concrete result this project should create"
        />
      </label>
      {#if createError}
        <p class="aa-error" role="alert">{createError}</p>
      {/if}
      <div class="aa-composer__actions">
        <button type="button" class="aa-btn aa-btn--ghost" onclick={() => (creating = false)}>
          Cancel
        </button>
        <button type="submit" class="aa-btn aa-btn--primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create project"}
        </button>
      </div>
    </form>
  {/if}

  {#if isEmpty && !creating}
    <div class="aa-list-empty">
      <h2>No projects yet.</h2>
      <p>
        Projects are outcomes that need more than one step. Create one here, or
        promote a big task during triage.
      </p>
    </div>
  {/if}

  {#if active.length > 0}
    <div class="aa-grid">
      {#each active as p (p.id)}
        <ProgressCard {...cardProps(p)} />
      {/each}
    </div>
  {/if}

  {#if completed.length > 0}
    <section class="aa-projects__completed" aria-labelledby="completed-projects-heading">
      <button
        type="button"
        class="aa-section-toggle"
        id="completed-projects-heading"
        aria-expanded={showCompleted}
        onclick={() => (showCompleted = !showCompleted)}
      >
        {showCompleted ? "Hide" : "Show"} completed ({completed.length})
      </button>
      {#if showCompleted}
        <div class="aa-grid">
          {#each completed as p (p.id)}
            <ProgressCard
              {...cardProps(p)}
              meta={[p.type === "SIMPLE_LIST" ? "List" : (p.goal?.name ?? "Standalone"), "Completed"]}
              focusLabel="Status"
              focusValue="Manage, archive, or delete"
              focusTone="muted"
              muted
            />
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if archived.length > 0}
    <section class="aa-projects__completed" aria-labelledby="archived-projects-heading">
      <button
        type="button"
        class="aa-section-toggle"
        id="archived-projects-heading"
        aria-expanded={showArchived}
        onclick={() => (showArchived = !showArchived)}
      >
        {showArchived ? "Hide" : "Show"} archived ({archived.length})
      </button>
      {#if showArchived}
        <div class="aa-grid">
          {#each archived as p (p.id)}
            <ProgressCard
              {...cardProps(p)}
              meta={[p.type === "SIMPLE_LIST" ? "List" : (p.goal?.name ?? "Standalone"), "Archived"]}
              focusLabel="Status"
              focusValue="Archived"
              focusTone="muted"
              muted
            />
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
