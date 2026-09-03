<script lang="ts">
  /**
   * TriageCard — a single captured item during the review walkthrough
   * (ported from webapp/src/components/ui/TriageCard.tsx; styles from
   * styles/TriageCard.css). The body is a reading surface (URLs linkified)
   * until clicked / the pencil toggles its editor. Exit direction encodes
   * the dispatch decision. Captured-image media is S12 — the card renders
   * without it and nothing here requires attachments.
   */
  import type { Snippet } from "svelte";
  import Chip from "./ui/Chip.svelte";
  import Linkify from "./ui/Linkify.svelte";
  import type { TriageChip, TriageExit } from "../triage/flow";

  let {
    body,
    onBodyChange,
    onBodyBlur,
    onBodyEdit,
    autoFocusBody = false,
    bodyLabel = "Title",
    meta,
    chips,
    exit = null,
    dispatched = false,
    entering = false,
    children,
  }: {
    body: string;
    onBodyChange?: (body: string) => void;
    onBodyBlur?: () => void;
    onBodyEdit?: () => void;
    autoFocusBody?: boolean;
    bodyLabel?: string;
    meta?: string;
    chips?: TriageChip[];
    exit?: TriageExit;
    dispatched?: boolean;
    entering?: boolean;
    children: Snippet;
  } = $props();

  const CHIP_VARIANT: Record<TriageChip["tone"], "teal" | "amber" | "violet"> = {
    date: "teal",
    priority: "amber",
    tag: "violet",
  };

  let titleEl: HTMLTextAreaElement | null = $state(null);

  $effect(() => {
    if (autoFocusBody && titleEl) {
      titleEl.focus();
      titleEl.selectionStart = titleEl.value.length;
    }
  });

  function onBodyClick(e: MouseEvent): void {
    if (!onBodyEdit) return;
    // A click on a linkified URL is the link's own — open it, don't turn
    // the body into an editor.
    if ((e.target as HTMLElement).closest("a")) return;
    onBodyEdit();
  }
</script>

<div
  class="aa-triage-card {exit ? `aa-triage-card--exit-${exit}` : ''}
    {dispatched ? "aa-triage-card--dispatched" : ""}
    {entering ? "aa-triage-card--entering" : ""}"
>
  {#if onBodyChange}
    <label class="aa-triage-card__title-field">
      <span class="aa-triage-card__title-label">{bodyLabel}</span>
      <textarea
        bind:this={titleEl}
        class="aa-triage-card__title-input"
        aria-label={bodyLabel}
        value={body}
        oninput={(e) => onBodyChange?.(e.currentTarget.value)}
        onblur={() => onBodyBlur?.()}
        rows={1}
        placeholder="What needs doing?"
      ></textarea>
    </label>
  {:else}
    <div class="aa-triage-card__body-wrap">
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
      <p
        class="aa-triage-card__body {onBodyEdit ? "aa-triage-card__body--editable" : ""}"
        onclick={onBodyClick}
      >
        <Linkify text={body} />
      </p>
      {#if onBodyEdit}
        <button
          type="button"
          class="aa-triage-card__body-edit"
          onclick={onBodyEdit}
          aria-label="Edit {bodyLabel.toLowerCase()}"
          title="Edit {bodyLabel.toLowerCase()}"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M11.3 2.6l2.1 2.1L6 12.1l-2.8.7.7-2.8L11.3 2.6z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
  {#if meta}
    <p class="aa-triage-card__meta">{meta}</p>
  {/if}
  {#if chips && chips.length > 0}
    <div class="aa-triage-card__chips">
      {#each chips as c, i (i)}
        <Chip variant={CHIP_VARIANT[c.tone]}>{c.label}</Chip>
      {/each}
    </div>
  {/if}
  {@render children()}
</div>
