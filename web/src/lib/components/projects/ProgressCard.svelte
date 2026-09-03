<script lang="ts">
  /**
   * ProgressCard — the record card both planning lists render (webapp
   * ui/ProgressCard verbatim port): meta chip → centered title → description
   * → progress bar + teal pct → Focus/Status chip (amber when a next action
   * exists). The whole card is the link. `variant="project"` applies the
   * page-level overrides webapp ProjectsPage.css makes (`.aa-project-card`).
   */
  interface Props {
    href: string;
    title: string;
    description?: string | null;
    /** Progress percentage (0 when total is 0 — never fabricated). */
    progress?: number;
    /** e.g. "1/3 done"; null/undefined falls back to "{progress}%". */
    progressLabel?: string | null;
    /** Meta chip fragments (plain strings; joined with " · "). */
    meta?: string[];
    /** Teal fragment appended to the meta chip (relative due date). */
    dueLabel?: string | null;
    focusLabel?: string | null;
    focusValue?: string | null;
    focusTone?: "muted" | "amber";
    variant?: "goal" | "project";
    muted?: boolean;
  }

  let {
    href,
    title,
    description = null,
    progress = 0,
    progressLabel = null,
    meta = [],
    dueLabel = null,
    focusLabel = null,
    focusValue = null,
    focusTone = "amber",
    variant = "goal",
    muted = false,
  }: Props = $props();
</script>

<!-- The whole card is the link (the crumb id IS the destination route). -->
<a class="aa-progress-card" class:project={variant === "project"} class:muted href={href}>
  {#if meta.length > 0 || dueLabel}
    <div class="aa-progress-card__meta">
      {#each meta as fragment, i (fragment)}
        {#if i > 0}<span class="aa-progress-card__dot" aria-hidden="true">·</span>{/if}
        <span>{fragment}</span>
      {/each}
      {#if dueLabel}
        {#if meta.length > 0}<span class="aa-progress-card__dot" aria-hidden="true">·</span>{/if}
        <span class="aa-progress-card__due">{dueLabel}</span>
      {/if}
    </div>
  {/if}
  <span class="aa-progress-card__title">{title}</span>
  {#if description}
    <p class="aa-progress-card__desc">{description}</p>
  {/if}
  <div class="aa-progress-card__progress">
    <div class="aa-progress-card__bar">
      <div class="aa-progress-card__fill" style:width="{progress}%"></div>
    </div>
    <span class="aa-progress-card__pct">{progressLabel ?? `${progress}%`}</span>
  </div>
  {#if focusLabel && focusValue}
    <p class="aa-progress-card__focus aa-progress-card__focus--{focusTone}">
      {focusLabel}: <span>{focusValue}</span>
    </p>
  {/if}
</a>

<style>
  /* Ported from webapp/src/components/ui/ProgressCard.css. */
  .aa-progress-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--aa-space-md);
    min-height: 330px;
    padding: 38px 34px;
    background: var(--aa-surface);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-2xl);
    box-shadow: var(--aa-hero-shadow);
    text-align: center;
    color: inherit;
    text-decoration: none;
    transition:
      border-color 0.12s var(--aa-ease-out),
      box-shadow 0.12s var(--aa-ease-out),
      transform 0.12s var(--aa-ease-out);
  }

  .aa-progress-card:hover {
    border-color: var(--aa-border-strong);
    box-shadow:
      0 4px 12px oklch(0.2 0.02 230 / 0.06),
      0 48px 112px var(--aa-teal-tint-shadow);
    text-decoration: none;
    transform: translateY(-1px);
  }

  .aa-progress-card.muted {
    opacity: 0.82;
  }

  /* ProjectsPage.css `.aa-project-card` overrides. */
  .aa-progress-card.project {
    min-height: 260px;
    padding: 30px 28px;
  }

  .aa-progress-card__title {
    display: block;
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-bold);
    line-height: 1.12;
    color: var(--aa-text);
    margin: 0;
    transition: color var(--aa-dur-base) var(--aa-ease-out);
  }

  .aa-progress-card:hover .aa-progress-card__title {
    color: var(--aa-teal-cta);
  }

  .aa-progress-card.project .aa-progress-card__title {
    font-size: var(--aa-text-lg);
  }

  .aa-progress-card__desc {
    max-width: 28ch;
    font-size: var(--aa-text-md);
    color: var(--aa-text-3);
    margin: 0;
    line-height: var(--aa-leading-normal);
  }

  .aa-progress-card.project .aa-progress-card__desc {
    font-size: var(--aa-text-base);
  }

  .aa-progress-card__progress {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--aa-space-md);
    margin-top: auto;
  }

  .aa-progress-card__bar {
    flex: 1;
    height: 8px;
    background: var(--aa-surface-muted-2);
    border-radius: var(--aa-radius-full);
    overflow: hidden;
  }

  .aa-progress-card__fill {
    height: 100%;
    background: var(--aa-teal);
    border-radius: var(--aa-radius-full);
    transition: width 0.3s var(--aa-ease-out-quart);
  }

  .aa-progress-card__pct {
    min-width: 44px;
    text-align: left;
    font-size: var(--aa-text-base);
    font-weight: var(--aa-weight-bold);
    color: var(--aa-teal-cta);
    white-space: nowrap;
  }

  .aa-progress-card.project .aa-progress-card__pct {
    min-width: 70px;
    font-size: var(--aa-text-sm);
  }

  .aa-progress-card__meta {
    order: -1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--aa-space-xs);
    padding: 5px 12px;
    background: var(--aa-surface-muted);
    border-radius: var(--aa-radius-full);
    color: var(--aa-text-3);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
  }

  .aa-progress-card__dot {
    opacity: 0.6;
  }

  .aa-progress-card__due {
    color: var(--aa-teal-cta);
  }

  .aa-progress-card__focus {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 5px 10px;
    border-radius: var(--aa-radius-sm);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    color: var(--aa-text-3);
  }

  .aa-progress-card__focus--amber {
    background: var(--aa-amber-soft);
  }

  .aa-progress-card__focus--amber span {
    color: var(--aa-amber-text);
  }

  .aa-progress-card__focus--muted {
    background: var(--aa-surface-muted);
  }

  .aa-progress-card__focus--muted span {
    color: var(--aa-text-3);
  }

  @media (prefers-reduced-motion: reduce) {
    .aa-progress-card,
    .aa-progress-card__fill {
      transition-duration: 0.01ms !important;
    }

    .aa-progress-card:hover {
      transform: none !important;
    }
  }
</style>
