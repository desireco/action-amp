<script lang="ts">
  /**
   * ProgressCard — the record card both planning lists render (webapp
   * ProgressCard parity): title → detail link, violet progress read,
   * meta line, and a Focus/Status slot (amber when a next action exists).
   */
  import type { ProjectType } from "../../stores/projects.svelte";

  interface Props {
    href: string;
    title: string;
    description?: string | null;
    /** Progress percentage (0 when total is 0 — never fabricated). */
    progress?: number;
    /** e.g. "1/3 done" or "2/5 checked"; null hides the progress band. */
    progressLabel?: string | null;
    /** Meta fragments (plain strings; joined with " · "). */
    meta?: string[];
    /** Chips appended after the meta line (label + teal tone). */
    dueLabel?: string | null;
    focusLabel?: string | null;
    focusValue?: string | null;
    focusTone?: "muted" | "amber";
    kind?: ProjectType;
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
    focusTone = "muted",
    kind = "STANDARD",
    muted = false,
  }: Props = $props();
</script>

<!-- The whole card is the link (the crumb id IS the destination route). -->
<a class="card" class:muted href={href}>
  <div class="head">
    <h3 class="title">{title}</h3>
    {#if progressLabel !== null}
      <span class="pct" data-kind={kind}>{progress}%</span>
    {/if}
  </div>
  {#if description}
    <p class="desc">{description}</p>
  {/if}
  {#if progressLabel !== null}
    <div class="track" role="presentation">
      <div class="fill" data-kind={kind} style:width="{progress}%"></div>
    </div>
    <span class="progress-label">{progressLabel}</span>
  {/if}
  {#if meta.length > 0}
    <p class="meta">
      {#each meta as fragment, i (fragment)}
        {#if i > 0}<span class="dot" aria-hidden="true">·</span>{/if}
        <span>{fragment}</span>
      {/each}
      {#if dueLabel}
        <span class="dot" aria-hidden="true">·</span>
        <span class="due">{dueLabel}</span>
      {/if}
    </p>
  {:else if dueLabel}
    <p class="meta"><span class="due">{dueLabel}</span></p>
  {/if}
  {#if focusLabel && focusValue}
    <div class="focus">
      <span class="focus-label" data-tone={focusTone}>{focusLabel}</span>
      <span class="focus-value" data-tone={focusTone}>{focusValue}</span>
    </div>
  {/if}
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 180px;
    padding: 22px 20px;
    background: var(--aa-surface);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-lg);
    box-shadow: var(--aa-shadow-sm);
    text-decoration: none;
    color: var(--aa-text);
    transition:
      border-color var(--aa-dur-base) var(--aa-ease-out),
      box-shadow var(--aa-dur-base) var(--aa-ease-out);
  }

  .card:hover {
    border-color: var(--aa-border-strong);
    box-shadow: var(--aa-shadow-md);
  }

  .card.muted {
    opacity: 0.82;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--aa-space-sm);
  }

  .title {
    margin: 0;
    font-size: var(--aa-text-lg);
    font-weight: var(--aa-weight-semibold);
    line-height: var(--aa-leading-tight);
  }

  .pct {
    min-width: 48px;
    text-align: right;
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
    font-feature-settings: "tnum" 1;
  }

  .desc {
    margin: 0;
    font-size: var(--aa-text-base);
    color: var(--aa-text-2);
    line-height: var(--aa-leading-snug);
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .track {
    height: 5px;
    margin-top: 4px;
    background: var(--aa-surface-muted-2);
    border-radius: var(--aa-radius-full);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: var(--aa-radius-full);
    transition: width 0.3s var(--aa-ease-out-quart);
  }

  /* Violet = project/goal identity; teal = standard project progress. */
  .fill[data-kind="SIMPLE_LIST"],
  .pct[data-kind="SIMPLE_LIST"] {
    background: var(--aa-violet);
  }
  .fill[data-kind="STANDARD"] {
    background: var(--aa-teal);
  }

  .progress-label {
    font-size: var(--aa-text-xs);
    color: var(--aa-text-3);
    font-feature-settings: "tnum" 1;
  }

  .meta {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    margin: 2px 0 0;
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
  }

  .dot {
    opacity: 0.6;
  }

  .due {
    color: var(--aa-teal-cta);
    font-size: var(--aa-text-xs);
  }

  .focus {
    display: flex;
    align-items: baseline;
    gap: var(--aa-space-sm);
    margin-top: auto;
    padding-top: var(--aa-space-sm);
    min-width: 0;
  }

  .focus-label {
    flex: none;
    font-size: var(--aa-text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--aa-text-4);
    font-weight: var(--aa-weight-medium);
  }

  .focus-value {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Amber = rare human emphasis — the one next action. */
  .focus-value[data-tone="amber"],
  .focus-label[data-tone="amber"] {
    color: var(--aa-amber-text);
  }
</style>
