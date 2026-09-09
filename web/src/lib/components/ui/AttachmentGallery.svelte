<script lang="ts">
  /**
   * AttachmentGallery — the triage card's media surface. Ported from webapp
   * ui/AttachmentThumbs.tsx. The first image shows big so the item can be
   * judged by what was actually shared; multiple images become a
   * scroll-snap carousel (arrows + dots for pointer/keyboard). Clicking
   * any image opens the AttachmentLightbox.
   */
  import AttachmentLightbox from "./AttachmentLightbox.svelte";
  import { attachmentSrc } from "../../attachments";
  import "./AttachmentThumbs.css";

  let {
    attachments,
    resolveSrc = attachmentSrc,
  }: {
    attachments: { id: string; filename: string }[];
    /** The <img> src builder — overridable so Storybook can stub bytes. */
    resolveSrc?: typeof attachmentSrc;
  } = $props();

  let openIndex = $state<number | null>(null);
  let active = $state(0);
  let trackEl: HTMLDivElement | null = $state(null);
  const many = $derived(attachments.length > 1);

  function go(target: number): void {
    const next = (target + attachments.length) % attachments.length;
    active = next;
    const track = trackEl;
    if (!track) return;
    const left = next * track.clientWidth;
    track.scrollTo({ left, behavior: "smooth" });
  }

  function onScroll(): void {
    const track = trackEl;
    if (!track) return;
    const width = Math.max(1, track.clientWidth);
    const next = Math.round(track.scrollLeft / width);
    if (active !== next) active = (next + attachments.length) % attachments.length;
  }

  const chevronLeft = "M10 3.5L5.5 8l4.5 4.5";
  const chevronRight = "M6 3.5L10.5 8l-4.5 4.5";
</script>

{#if attachments.length > 0}
  <div class="aa-attach-gallery">
    <div bind:this={trackEl} class="aa-attach-gallery__track" onscroll={onScroll}>
      {#each attachments as attachment, i (attachment.id)}
        <button
          type="button"
          class="aa-attach-gallery__slide"
          onclick={() => (openIndex = i)}
          aria-label="Open image {attachment.filename}"
          aria-haspopup="dialog"
        >
          <img
            class="aa-attach-gallery__img"
            src={resolveSrc(attachment.id)}
            alt={attachment.filename}
            draggable="false"
          />
        </button>
      {/each}
    </div>
    {#if many}
      <button
        type="button"
        class="aa-attach-gallery__nav aa-attach-gallery__nav--prev"
        aria-label="Previous image"
        onclick={() => go(active - 1)}
      >
        <svg viewBox="0 0 16 16" fill="none"><path d={chevronLeft} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button
        type="button"
        class="aa-attach-gallery__nav aa-attach-gallery__nav--next"
        aria-label="Next image"
        onclick={() => go(active + 1)}
      >
        <svg viewBox="0 0 16 16" fill="none"><path d={chevronRight} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div class="aa-attach-gallery__dots" role="tablist" aria-label="Images">
        {#each attachments as attachment, i (attachment.id)}
          <button
            type="button"
            class="aa-attach-gallery__dot{i === active ? " is-active" : ""}"
            aria-label="Show image {i + 1} of {attachments.length}"
            aria-current={i === active || undefined}
            onclick={() => go(i)}
          ></button>
        {/each}
      </div>
    {/if}
    {#if openIndex !== null}
      <AttachmentLightbox
        attachments={attachments}
        index={openIndex}
        onClose={() => (openIndex = null)}
      />
    {/if}
  </div>
{/if}
