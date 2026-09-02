<script lang="ts">
  // WhatNowCard — the composite task card, the product's wedge (NextCard
  // port). Title → meta → amber "why" line → goal rationale + continuity
  // (next state only) → Start / Pause|Not now. No completion control on the
  // card — completing happens in focus mode.
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
  .aa-wn-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.9rem;
    max-width: 34rem;
    margin: 0 auto;
    padding: 1rem 0.5rem;
  }
  .aa-wn-card__context {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-wn-card__title {
    font-size: var(--aa-text-2xl);
    font-weight: var(--aa-weight-semibold);
    margin: 0;
    line-height: var(--aa-leading-tight);
    color: var(--aa-text);
  }
  .aa-wn-card__title.strike {
    text-decoration: line-through;
    color: var(--aa-text-muted, oklch(0.55 0.01 240));
  }
  .aa-wn-card__meta {
    display: flex;
    gap: 0.4rem;
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    align-items: baseline;
  }
  .aa-wn-card__why {
    margin: 0;
    font-size: var(--aa-text-md);
  }
  .aa-wn-card__why strong {
    color: var(--aa-amber-text);
    font-weight: var(--aa-weight-semibold);
  }
  .aa-wn-card__purpose {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    width: 100%;
  }
  .aa-wn-card__goal-question {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin: 0 0 0.15rem;
  }
  .aa-wn-card__goal-answer {
    margin: 0;
    font-size: var(--aa-text-md);
    line-height: var(--aa-leading-normal);
    color: var(--aa-text);
  }
  .aa-wn-card__goal-attribution {
    margin: 0.25rem 0 0;
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-wn-card__continuity-stats {
    margin: 0;
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-wn-card__latest-note {
    margin: 0.35rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .aa-wn-card__latest-note-label {
    font-size: var(--aa-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-wn-card__latest-note-body {
    font-size: var(--aa-text-sm);
    color: var(--aa-text);
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .aa-wn-card__actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.5rem;
  }
  .aa-btn {
    border-radius: 8px;
    padding: 0.5rem 1.1rem;
    font-size: var(--aa-text-md);
    cursor: pointer;
    border: 1px solid transparent;
  }
  .aa-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .aa-btn--primary {
    background: var(--aa-primary);
    color: white;
  }
  .aa-btn--primary:hover:not(:disabled) {
    background: var(--aa-primary-hover);
  }
  .aa-btn--secondary {
    background: transparent;
    border-color: var(--aa-border-strong, oklch(0.85 0.006 240));
    color: var(--aa-text);
  }
</style>
