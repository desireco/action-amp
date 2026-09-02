<script lang="ts">
  // AlternativesRail — "Or choose another task in <Lens>" below the card
  // (NextAlternatives port). Choosing is pure navigation; nothing mutates.
  export interface NextAlternative {
    id: string;
    permalink: string;
    title: string;
    project?: string;
    due?: string;
    size?: string;
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
          <button class="aa-wn-alts__row" type="button" onclick={() => onChoose(task)}>
            <span class="aa-wn-alts__row-main">
              {#if task.suggested}
                <span class="aa-wn-alts__kicker">Suggested</span>
              {/if}
              <span class="aa-wn-alts__row-title">{task.title}</span>
              {#if task.project || task.due || task.size}
                <span class="aa-wn-alts__row-meta">
                  {[task.project, task.due, task.size].filter(Boolean).join(" · ")}
                </span>
              {/if}
            </span>
            <span class="aa-wn-alts__row-action" aria-hidden="true">Choose instead</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .aa-wn-alts {
    max-width: 34rem;
    margin: 1.5rem auto 0;
  }
  .aa-wn-alts__title {
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-medium);
    margin: 0;
    color: var(--aa-text);
  }
  .aa-wn-alts__hint {
    margin: 0.1rem 0 0;
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-wn-alts__list {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .aa-wn-alts__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    text-align: left;
    background: none;
    border: 1px solid var(--aa-border, oklch(0.92 0.004 240));
    border-radius: 10px;
    padding: 0.55rem 0.75rem;
    cursor: pointer;
    color: var(--aa-text);
  }
  .aa-wn-alts__row:hover {
    border-color: var(--aa-teal);
  }
  .aa-wn-alts__row-main {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .aa-wn-alts__kicker {
    font-size: var(--aa-text-xs);
    color: var(--aa-teal-cta);
    font-weight: var(--aa-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .aa-wn-alts__row-title {
    font-size: var(--aa-text-base);
  }
  .aa-wn-alts__row-meta {
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-wn-alts__row-action {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    flex: none;
  }
</style>
