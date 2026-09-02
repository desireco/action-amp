<script lang="ts">
  /**
   * GoalsView — the /do/goals surface (webapp GoalsPage parity): lens-scoped
   * ACTIVE goals with rollup progress + the muted "Focus: <name>" line
   * (hidden when there is no next project — "never lies"), plus the create
   * composer and the ProGate panel on a 402.
   */
  import { onMount } from "svelte";
  import "../../styles/projects.css";
  import { goals } from "../../stores/goals.svelte";
  import { type GateMessage } from "../../stores/projects.svelte";
  import ProgressCard from "../projects/ProgressCard.svelte";

  let creating = $state(false);
  let submitting = $state(false);
  let gate = $state<GateMessage | null>(null);
  let createError = $state<string | null>(null);
  let name = $state("");
  let description = $state("");


  /** Focus the field on mount (autofocus trips the a11y lint; this doesn't). */
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  onMount(() => {
    void goals.load();
  });

  // Webapp parity: the empty state renders when the list is empty and the
  // composer is closed.
  const showEmptyState = $derived(goals.loaded && goals.goals.length === 0 && !creating);

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    gate = null;
    createError = null;
    const result = await goals.create({ name, description: description || undefined });
    submitting = false;
    if (!result.ok) {
      // Entitlement: a 402 from the cap guard → paywall moment, not raw error.
      gate = result.gate;
      if (!gate) createError = result.message;
      return;
    }
    creating = false;
    name = "";
    description = "";
  }
</script>

<div class="aa-goals">
  <header class="aa-list-header">
    <div>
      <div class="aa-list-header__eyebrow">Planning</div>
      <h1 class="aa-list-header__title">Goals</h1>
      <p class="aa-list-header__description">
        {#if goals.busy && !goals.loaded}
          Loading active goals…
        {:else}
          {goals.goals.length} active · Outcomes your projects move forward.
        {/if}
      </p>
    </div>
    <button type="button" class="aa-create-control" onclick={() => (creating = !creating)}>
      {creating ? "Close" : "New goal"}
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
      <h2 class="aa-composer__title">New goal</h2>
      <p class="aa-composer__subtitle">Name the outcome. Add the why if it helps.</p>
      <label class="aa-field">
        Outcome
        <input use:focusOnMount bind:value={name} placeholder="Grow audience" />
      </label>
      <label class="aa-field">
        Why this matters
        <input
          bind:value={description}
          placeholder="So launches do not depend on one-off posts"
        />
      </label>
      {#if createError}
        <p class="aa-error" role="alert">{createError}</p>
      {/if}
      <div class="aa-composer__actions">
        <button
          type="button"
          class="aa-btn aa-btn--secondary"
          onclick={() => (creating = false)}
        >
          Cancel
        </button>
        <button type="submit" class="aa-btn aa-btn--primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create goal"}
        </button>
      </div>
    </form>
  {/if}

  {#if showEmptyState}
    <div class="aa-list-empty">
      <h2>No goals yet.</h2>
      <p>
        Goals are active outcomes — what your projects and tasks roll up to.
        Create one, or link a project/task to a goal during triage.
      </p>
    </div>
  {/if}

  {#if goals.goals.length > 0}
    <div class="aa-grid aa-goals__grid">
      {#each goals.goals as g (g.id)}
        <ProgressCard
          href="/do/goals/{g.permalink}"
          title={g.name}
          description={g.description}
          progress={g.progress}
          progressLabel="{g.progress}%"
          meta={[`${g.projectCount} project${g.projectCount === 1 ? "" : "s"}`]}
          focusLabel={g.nextProject ? "Focus" : null}
          focusValue={g.nextProject?.name ?? null}
          focusTone="muted"
          kind="STANDARD"
        />
      {/each}
    </div>
  {/if}
</div>
