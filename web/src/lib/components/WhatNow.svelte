<script lang="ts">
  // WhatNow — the home screen (the NextPage port). One task card, not a
  // list. Now/Next state machine: Start → focus; Pause / Defer / Done exit
  // Now. `pickedToken` (/do/today/:permalink or ?task=) puts a chosen
  // alternative on the stage; alternatives render only while deciding.
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

<div class="aa-wn">
  <a href="/do/today" class="aa-wn-today-link">See Today →</a>

  {#if loading}
    <div class="aa-wn-veil" aria-hidden="true"></div>
    <div class="aa-wn">
      <div class="aa-wn-eyebrow">What now</div>
      <h1 class="aa-wn-empty">…</h1>
    </div>
  {:else if task}
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
  .aa-wn {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 1.25rem 1rem 2.5rem;
    min-height: 60dvh;
  }
  .aa-wn-today-link {
    position: absolute;
    top: 1.25rem;
    right: 1rem;
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    text-decoration: none;
  }
  .aa-wn-today-link:hover {
    color: var(--aa-teal-cta);
  }
  .aa-wn-eyebrow {
    font-size: var(--aa-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin-top: 3rem;
  }
  .aa-wn-empty {
    font-size: var(--aa-text-2xl);
    font-weight: var(--aa-weight-semibold);
    margin: 0.5rem auto 0;
    text-align: center;
    max-width: 30rem;
  }
  .aa-wn-empty-sub {
    text-align: center;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    max-width: 30rem;
    margin: 0.6rem auto 0;
    line-height: var(--aa-leading-relaxed);
  }
  .aa-wn-kbd {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-sm);
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    border-radius: 5px;
    padding: 0 0.3rem;
  }
  .aa-wn-lens-hints {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    align-items: center;
    margin-top: 1.5rem;
  }
  .aa-wn-lens-hint {
    font-size: var(--aa-text-sm);
    color: var(--aa-teal-cta);
  }
  .aa-wn-card__context-lens {
    color: var(--aa-teal-cta);
  }
  .aa-wn-veil {
    position: absolute;
    inset: 0;
    background: var(--aa-bg, transparent);
    z-index: 5;
  }
</style>
