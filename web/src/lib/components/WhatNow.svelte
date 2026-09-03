<script lang="ts">
  // WhatNow — the home screen (the NextPage port). One task card, not a
  // list. Now/Next state machine: Start → focus; Pause / Defer / Done exit
  // Now. `pickedToken` (/do/today/:permalink or ?task=) puts a chosen
  // alternative on the stage; alternatives render only while deciding.
  //
  // Composition (webapp NextPage.tsx + NextPage.css): a centered ritual —
  // "See Today →" as a centered link at the top, the 520px NextCard, then the
  // alternatives rail; the whole group vertically centers in the main area
  // while the card is on stage. The empty state keeps a centered 620px column.
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import WhatNowCard from "./WhatNowCard.svelte";
  import AlternativesRail from "./AlternativesRail.svelte";
  import SnoozeSheet from "./SnoozeSheet.svelte";
  import { whatNow } from "../stores/whatNow.svelte";
  import { lenses } from "../stores/lenses.svelte";
  import {
    composeWhy,
    resolveGoal,
    resolveContinuity,
    continuityStatsRow,
    dueLabelFor,
    sizeLabel,
    formatWhen,
  } from "../taskView";
  import type { WhatNowTask } from "../dto";
  import type { SnoozePreset } from "../dto";

  let { pickedToken = null }: { pickedToken?: string | null } = $props();

  let snoozeOpen = $state(false);
  let entered = $state(false);

  $effect(() => {
    // Splash latch: the veil covers only the first data load. Tracked: the
    // shell's active lens (re-scopes the stage when the switcher moves) and
    // the picked token (re-stages when the route points at another task).
    // The load itself runs untracked — it reads+writes store state (appData,
    // loading), which must not re-trigger the effect.
    void lenses.activeLensId;
    const token = pickedToken;
    untrack(() => {
      void whatNow.load(token).then(() => {
        entered = true;
      });
    });
  });

  const task = $derived(whatNow.picked ?? whatNow.topTask);
  const isNow = $derived(!!task?.startedAt);
  const loading = $derived(whatNow.loading && !entered);

  function dueLabel(t: { status: string; scheduledDate: string | null }): string | null {
    return t.status === "TODAY" ? "due today" : t.scheduledDate ? `due ${formatWhen(t.scheduledDate)}` : null;
  }

  async function handleSnooze(preset: SnoozePreset) {
    if (!task) return;
    await whatNow.snooze(task.id, preset);
    await whatNow.load(pickedToken);
    if (pickedToken) void goto("/do/today", { replaceState: true });
  }

  async function handleStart() {
    if (!task) return;
    if (isNow) {
      void goto("/do/focus");
      return;
    }
    await whatNow.start(task.id);
    void goto("/do/focus");
  }

  async function handlePause() {
    if (!task) return;
    await whatNow.pause(task.id);
    await whatNow.load(pickedToken);
  }

  // SAFETY: the picked-task detail overlaps the card's inputs for every
  // field it renders; history relations are absent on that path (the
  // webapp's getTask behavior — continuity degrades to "no history").
  function cardFor(t: WhatNowTask) {
    const why = composeWhy(t);
    // lead → why (plain), detail → whyEmphasis (strong amber). A lead-less
    // detail IS the reason — promoted to plain why, never amber-alone.
    const goalContext = !t.startedAt ? resolveGoal({ project: t.project, goal: t.goal }) : null;
    const continuity = !t.startedAt
      ? resolveContinuity({ project: t.project, goal: t.goal, sessions: t.sessions, updates: t.notes })
      : null;
    return {
      title: t.description,
      project: t.project?.name,
      due: dueLabelFor(t) ?? undefined,
      size: sizeLabel(t.size),
      why: (why.lead || why.detail) || undefined,
      whyEmphasis: why.lead ? why.detail : undefined,
      goalContext,
      continuityStats: continuity ? continuityStatsRow(continuity) : null,
      latestNote: !t.startedAt ? continuity?.latestNote ?? null : null,
      attachments: t.attachments,
    };
  }
</script>

<div class="aa-wn-page" class:centered={!loading && !!task}>
  {#if loading}
    <div class="aa-wn-veil" aria-hidden="true"></div>
    <div class="aa-wn">
      <div class="aa-wn-eyebrow">What now</div>
      <h1 class="aa-wn-empty">…</h1>
    </div>
  {:else if task}
    <a href="/do/today" class="aa-wn-today-link">See Today →</a>

    <WhatNowCard
      task={cardFor(task as WhatNowTask)}
      cardState={isNow ? "now" : "next"}
      onDo={handleStart}
      onPause={handlePause}
      onNotNow={() => (snoozeOpen = true)}
    >
      {#snippet context()}
        {isNow ? "Now" : pickedToken ? "Picked" : "Next"} in
        <span class="aa-wn-card__context-lens">{whatNow.lens?.name ?? ""}</span>
      {/snippet}
    </WhatNowCard>

    {#if !isNow}
      <AlternativesRail
        lensName={whatNow.lens?.name ?? ""}
        tasks={whatNow.alternatives
          .filter((t) => t.id !== task.id)
          .map((t) => ({
            id: t.id,
            permalink: t.permalink,
            title: t.description,
            project: t.project?.name,
            due: dueLabelFor(t) ?? undefined,
            size: sizeLabel(t.size),
            suggested: t.id === whatNow.topTask?.id,
          }))}
        onChoose={(t) => goto(`/do/today/${encodeURIComponent(t.permalink)}`)}
      />
    {/if}

    {#if snoozeOpen && task}
      <SnoozeSheet
        taskTitle={task.description}
        onSnooze={handleSnooze}
        onClose={() => (snoozeOpen = false)}
      />
    {/if}
  {:else}
    <div class="aa-wn">
      <a href="/do/today" class="aa-wn-today-link">See Today →</a>

      <div class="aa-wn-eyebrow">What now</div>
      <h1 class="aa-wn-empty">
        {pickedToken ? "That task isn't available." : "Nothing on the table."}
      </h1>
      <p class="aa-wn-empty-sub">
        {#if pickedToken}
          It may have moved or been completed. Go back to Today, or clear the selected task.
        {:else}
          You're all caught up. Capture something with <span class="aa-wn-kbd">⌘K</span>, then
          triage it to Today to put it on the table.
        {/if}
      </p>
      {#if !pickedToken && whatNow.otherCounts.length > 0}
        <div class="aa-wn-lens-hints">
          {#each whatNow.otherCounts as hint (hint.lensId)}
            <span class="aa-wn-lens-hint">{hint.lensName} · {hint.count} on the table</span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Page root — fills the shell's screen-container so the card group can
     vertically center (webapp: .aa-app-main:has(.aa-wn-card) centers). */
  .aa-wn-page {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.25rem 1rem 2.5rem;
  }
  /* Card on stage → the ritual centers in the viewport. `safe` keeps the
     top reachable when the card + alternatives outrun the viewport. */
  .aa-wn-page.centered {
    justify-content: center;
    justify-content: safe center;
  }

  /* "See Today" link — top of the Do chooser, a centered block in the flow
     (NextPage.css). The page-level path from the focus card to the Today
     list; teal (system/state) carries it. */
  .aa-wn-today-link {
    display: block;
    text-align: center;
    margin-bottom: var(--aa-space-lg);
    font-size: var(--aa-text-base);
    font-weight: var(--aa-weight-semibold);
    color: var(--aa-teal-cta);
    text-decoration: none;
  }

  /* Empty state — the same centered column the card composes into
     (NextPage.css `.aa-wn`: 620px, margin auto). */
  .aa-wn {
    max-width: 620px;
    margin: 0 auto;
  }

  .aa-wn-eyebrow {
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--aa-text-4);
    margin-bottom: var(--aa-space-md);
  }

  .aa-wn-empty {
    font-size: var(--aa-text-2xl);
    font-weight: var(--aa-weight-bold);
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--aa-text);
    margin: 0 0 var(--aa-space-md);
  }

  .aa-wn-empty-sub {
    font-size: var(--aa-text-lg);
    line-height: var(--aa-leading-normal);
    color: var(--aa-text-3);
    margin: 0;
    max-width: 480px;
  }

  /* Inline kbd hint inside the empty state copy */
  .aa-wn-kbd {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    background: var(--aa-surface-muted-2);
    color: var(--aa-text-4);
    padding: 2px 6px;
    border-radius: var(--aa-radius-xs, 4px);
    border: 1px solid var(--aa-border);
    white-space: nowrap;
  }

  /* Other-lens pointers under the empty state (do-empty-lens-hints). One calm
   * line per lens with actionable work. Teal only on interaction — resting
   * state is quiet. */
  .aa-wn-lens-hints {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--aa-space-xs);
    margin-top: var(--aa-space-lg);
  }

  .aa-wn-lens-hint {
    font-size: var(--aa-text-md);
    line-height: var(--aa-leading-normal);
    color: var(--aa-text-3);
    text-align: left;
  }

  .aa-wn-card__context-lens {
    font-weight: var(--aa-weight-semibold);
    color: var(--aa-active-lens-text);
  }

  .aa-wn-veil {
    position: absolute;
    inset: 0;
    background: var(--aa-bg, transparent);
    z-index: 5;
  }
</style>
