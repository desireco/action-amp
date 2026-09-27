<script lang="ts">
  // AlternativesRail — "Or choose another task in <Lens>" below the card
  // (webapp ui/NextAlternatives port: markup + CSS). Choosing is pure
  // navigation; nothing mutates. Calm by design: one hairline, quiet
  // borderless rows; teal only as selection intent on hover/focus.
  // Deviation from the verbatim port: the row is a role="button" div
  // (TaskRow's pattern) so the project name inside the meta can be a real
  // link to the project page — it stops propagation and navigates on its own.
  export interface NextAlternative {
    /** Task id — used as the key and to exclude the on-stage task */
    id: string;
    /** Permalink — choosing a row routes to /today/:permalink */
    permalink: string;
    title: string;
    project?: string;
    /** Project permalink — present when `project` is; links the project page. */
    projectPermalink?: string;
    due?: string;
    size?: string;
    /** True when this row is the focus engine's current #1 — the
     * recommendation that yielded the stage to a picked task. Renders the
     * "Suggested" kicker so the matcher's voice survives below the fold. */
    suggested?: boolean;
  }

  let {
    lensName,
    tasks,
    onChoose,
  }: {
    lensName: string;
    tasks: NextAlternative[];
    onChoose: (task: NextAlternative) => void;
  } = $props();
</script>

{#if tasks.length > 0}
  <section class="aa-wn-alts" aria-label="Alternative tasks">
    <div class="aa-wn-alts__heading">
      <h2 class="aa-wn-alts__title">Or choose another task in {lensName}</h2>
      <p class="aa-wn-alts__hint">The recommendation stays available.</p>
    </div>
    <ul class="aa-wn-alts__list">
      {#each tasks as task (task.id)}
        <li>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_click_events_have_key_events -->
          <div
            class="aa-wn-alts__row"
            role="button"
            tabindex={0}
            onclick={() => onChoose(task)}
            onkeydown={(e) => {
              if (e.key === "Enter") onChoose(task);
            }}
          >
            <span class="aa-wn-alts__row-main">
              {#if task.suggested}
                <span class="aa-wn-alts__kicker">Suggested</span>
              {/if}
              <span class="aa-wn-alts__row-title">{task.title}</span>
              {#if task.project || task.due || task.size}
                <span class="aa-wn-alts__row-meta">
                  {#if task.project}
                    <a
                      class="aa-wn-alts__row-project"
                      href="/projects/{task.projectPermalink}"
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={(e) => e.stopPropagation()}
                    >{task.project}</a>
                  {/if}
                  {#if task.project && (task.due || task.size)}{" · "}{/if}
                  {[task.due, task.size].filter(Boolean).join(" · ")}
                </span>
              {/if}
            </span>
            <span class="aa-wn-alts__row-action" aria-hidden="true">Choose instead</span>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  /* ============================================================
     NextAlternatives — ported verbatim from
     webapp/src/components/ui/NextAlternatives.css (class names
     preserved — the established primitive).
     ============================================================ */
  .aa-wn-alts {
    width: 100%;
    max-width: 520px;
    margin: 44px auto 0;
    padding-top: 24px;
    border-top: 1px solid var(--aa-border);
    text-align: left;
    animation: aa-wn-alts-rise 0.5s var(--aa-ease-out-quart) both;
    animation-delay: 0.16s;
  }

  @keyframes aa-wn-alts-rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .aa-wn-alts__heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 6px;
  }

  .aa-wn-alts__title {
    margin: 0;
    font-size: var(--aa-text-base);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: -0.01em;
    color: var(--aa-text-2);
  }

  .aa-wn-alts__hint {
    margin: 0;
    font-size: var(--aa-text-sm);
    color: var(--aa-text-4);
    white-space: nowrap;
  }

  .aa-wn-alts__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One row = one choose target (role="button" div, so the project link can
     nest inside). Whitespace separates rows (no chrome); hover and focus
     carry the intent: title shifts toward teal (selection, never amber), the
     trailing affordance underlines. */
  .aa-wn-alts__row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 64px;
    padding: 10px 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .aa-wn-alts__row-main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .aa-wn-alts__kicker {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--aa-text-4);
  }

  .aa-wn-alts__row-title {
    font-size: var(--aa-text-lg);
    font-weight: var(--aa-weight-semibold);
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--aa-text);
    transition: color 150ms var(--aa-ease-out);
    overflow-wrap: anywhere;
  }

  .aa-wn-alts__row-meta {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
  }

  /* Project link inside the meta — same treatment as the card's context-line
     link: quiet gray + thin underline at rest, violet (project identity) on
     hover. stopPropagation keeps it from choosing the task. */
  .aa-wn-alts__row-project {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: var(--aa-border-strong);
    text-underline-offset: 3px;
  }
  .aa-wn-alts__row-project:hover {
    color: var(--aa-violet-text);
    text-decoration-color: var(--aa-violet-text);
  }

  .aa-wn-alts__row-action {
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    color: var(--aa-primary);
    white-space: nowrap;
  }

  .aa-wn-alts__row:hover .aa-wn-alts__row-title,
  .aa-wn-alts__row:focus-visible .aa-wn-alts__row-title {
    color: var(--aa-accent);
  }

  .aa-wn-alts__row:hover .aa-wn-alts__row-action,
  .aa-wn-alts__row:focus-visible .aa-wn-alts__row-action {
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .aa-wn-alts__row:focus-visible {
    outline: none;
    box-shadow: var(--aa-focus-ring);
  }

  @media (max-width: 480px) {
    .aa-wn-alts__heading {
      flex-direction: column;
      gap: 4px;
    }

    .aa-wn-alts__hint {
      white-space: normal;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aa-wn-alts {
      animation-duration: 0.01ms !important;
    }

    .aa-wn-alts__row-title {
      transition-duration: 0.01ms !important;
    }
  }
</style>
