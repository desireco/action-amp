<script lang="ts">
  // WhatNowCard — the composite task card, the product's wedge (webapp
  // ui/NextCard verbatim port: markup + CSS). Title → meta → amber "why"
  // line → goal rationale + continuity (next state only) → Start / Pause|Not
  // now. Flat app-shell variant: no card chrome, centered, 520px. No
  // completion control on the card — completing happens in focus mode.
  import type { Snippet } from "svelte";
  import type { GoalContext } from "../taskView";

  export interface NextTaskDisplay {
    title: string;
    project?: string;
    due?: string;
    size?: string;
    why?: string;
    whyEmphasis?: string;
    goalContext?: GoalContext | null;
    continuityStats?: string | null;
    latestNote?: string | null;
    attachments?: { id: string; filename: string }[];
  }

  let {
    task,
    context,
    cardState = "next",
    onDo,
    onPause,
    onNotNow,
  }: {
    task: NextTaskDisplay;
    context?: Snippet;
    cardState?: "next" | "now";
    onDo: () => void;
    onPause?: () => void;
    onNotNow?: () => void;
  } = $props();

  let doing = $state(false);

  function handleDo() {
    doing = true;
    onDo();
  }
</script>

<div class="aa-wn-card">
  {#if context}
    <div class="aa-wn-card__context">{@render context()}</div>
  {/if}

  <h2 class="aa-wn-card__title" class:strike={doing}>{task.title}</h2>

  {#if task.project || task.due || task.size}
    <div class="aa-wn-card__meta">
      {#if task.project}<span class="aa-wn-card__meta-item">{task.project}</span>{/if}
      {#if task.project && task.due}<span class="aa-wn-card__sep" aria-hidden="true">·</span>{/if}
      {#if task.due}<span class="aa-wn-card__meta-item">{task.due}</span>{/if}
      {#if task.due && task.size}<span class="aa-wn-card__sep" aria-hidden="true">·</span>{/if}
      {#if task.size}<span class="aa-wn-card__meta-item">{task.size}</span>{/if}
    </div>
  {/if}

  {#if task.why || task.whyEmphasis}
    <p class="aa-wn-card__why">
      {#if task.why}{task.why}{/if}
      {#if task.why && task.whyEmphasis}{" "}{/if}
      {#if task.whyEmphasis}<strong>{task.whyEmphasis}</strong>{/if}
    </p>
  {/if}

  {#if cardState === "next" && (task.goalContext || task.continuityStats)}
    <section class="aa-wn-card__purpose" aria-label="Goal and previous work">
      {#if task.goalContext}
        <div class="aa-wn-card__goal" aria-label="Goal context">
          <p class="aa-wn-card__goal-question">Why does this matter?</p>
          <p class="aa-wn-card__goal-answer">
            {task.goalContext.description ?? `Toward ${task.goalContext.name}.`}
          </p>
          {#if task.goalContext.description}
            <p class="aa-wn-card__goal-attribution">Goal · {task.goalContext.name}</p>
          {/if}
        </div>
      {/if}
      {#if task.continuityStats}
        <div class="aa-wn-card__continuity" aria-label="Previous work">
          <p class="aa-wn-card__continuity-stats">{task.continuityStats}</p>
          {#if task.latestNote}
            <p class="aa-wn-card__latest-note">
              <span class="aa-wn-card__latest-note-label">Latest note</span>
              <span class="aa-wn-card__latest-note-body">{task.latestNote}</span>
            </p>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  <div class="aa-wn-card__actions">
    <button type="button" class="aa-btn aa-btn--primary" onclick={handleDo} disabled={doing}>
      {doing ? "Done ✓" : "Start"}
    </button>
    {#if cardState === "now"}
      <button type="button" class="aa-btn aa-btn--secondary" onclick={() => onPause?.()} disabled={doing}>
        Pause
      </button>
    {:else}
      <button type="button" class="aa-btn aa-btn--secondary" onclick={() => onNotNow?.()} disabled={doing}>
        Not now
      </button>
    {/if}
  </div>
</div>

<style>
  /* ============================================================
     NextCard — the composite task card (app-shell variant, flat).
     Ported verbatim from webapp/src/components/ui/NextCard.css;
     the button treatments come from webapp Button.css (md size,
     primary/secondary variants).
     ============================================================ */
  .aa-wn-card {
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    text-align: center;
    animation: aa-wn-rise 0.5s var(--aa-ease-out-quart) both;
    animation-delay: 0.08s;
  }

  @keyframes aa-wn-rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Context line — "Now in Work". The state half (Now/Next) stays neutral; only
     the lens name carries the identity color, so the hue reads as context, not
     urgency. Demoted in size; the color is the signal, not loudness. */
  .aa-wn-card__context {
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-medium);
    color: var(--aa-text-3);
    margin-bottom: 36px;
    letter-spacing: 0.01em;
  }

  /* Task title */
  .aa-wn-card__title {
    font-size: var(--aa-text-2xl);
    font-weight: var(--aa-weight-bold);
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: var(--aa-text);
    margin: 0 0 12px;
  }

  .aa-wn-card__title.strike {
    text-decoration: line-through;
    color: var(--aa-text-3);
  }

  /* Meta line (project · due · size) */
  .aa-wn-card__meta {
    font-size: var(--aa-text-base);
    color: var(--aa-text-3);
    margin-bottom: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .aa-wn-card__sep {
    color: var(--aa-border-strong);
  }

  /* "Why this" line — amber emphasis */
  .aa-wn-card__why {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
    margin: 0 0 32px;
    line-height: var(--aa-leading-normal);
  }

  .aa-wn-card__why strong {
    color: var(--aa-amber-text);
    font-weight: var(--aa-weight-semibold);
  }

  /* ---- Goal rationale + paused-work continuity (focus-goal-context spec) ----
     Shown only in the `next` candidate state. Both blocks stay subordinate to
     the title and actions — narrower in visual weight, no card/icon/link/
     disclosure/editor. Violet = Project/Goal identity (never amber). */
  .aa-wn-card__purpose {
    max-width: 460px;
    margin: 0 auto 28px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: var(--aa-space-md, 14px);
  }

  /* Goal block */
  .aa-wn-card__goal-question {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
    margin: 0 0 4px;
  }
  .aa-wn-card__goal-answer {
    font-size: var(--aa-text-base);
    color: var(--aa-text-2);
    line-height: var(--aa-leading-normal);
    margin: 0;
  }
  .aa-wn-card__goal-attribution {
    font-size: var(--aa-text-sm);
    color: var(--aa-violet-text);
    margin: 6px 0 0;
  }

  /* Continuity block */
  .aa-wn-card__continuity-stats {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .aa-wn-card__latest-note {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 8px 0 0;
  }
  .aa-wn-card__latest-note-label {
    font-size: var(--aa-text-xs, 0.75rem);
    color: var(--aa-text-4, var(--aa-text-3));
    text-transform: lowercase;
  }
  .aa-wn-card__latest-note-body {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
    line-height: var(--aa-leading-normal);
    /* Passive two-line plain-text preview — clamp, no expansion control. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Actions */
  .aa-wn-card__actions {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  /* ---- Buttons — webapp Button.css (base, md size, primary/secondary) ---- */
  .aa-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--aa-font);
    font-size: var(--aa-text-base);
    font-weight: var(--aa-weight-semibold);
    padding: 9px 18px;
    border: 1px solid transparent;
    border-radius: var(--aa-radius-sm);
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.15s var(--aa-ease-out),
      border-color 0.15s var(--aa-ease-out),
      color 0.15s var(--aa-ease-out),
      box-shadow 0.15s var(--aa-ease-out),
      transform 0.08s var(--aa-ease-out);
  }
  .aa-btn:active:not(:disabled) {
    transform: scale(0.97);
  }
  .aa-btn:focus-visible {
    outline: 2px solid var(--aa-teal);
    outline-offset: 2px;
  }
  .aa-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .aa-btn--primary {
    background: var(--aa-teal-cta);
    color: var(--aa-surface);
    box-shadow: var(--aa-shadow-sm);
  }
  .aa-btn--primary:hover:not(:disabled) {
    background: var(--aa-teal-cta-hover);
    box-shadow: 0 4px 12px var(--aa-teal-tint-shadow);
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

  @media (prefers-reduced-motion: reduce) {
    .aa-wn-card {
      animation-duration: 0.01ms !important;
    }
    .aa-btn {
      transition-duration: 0.01ms !important;
    }
    .aa-btn:active:not(:disabled) {
      transform: none !important;
    }
  }
</style>
