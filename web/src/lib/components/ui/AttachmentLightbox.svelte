<script lang="ts">
  /**
   * AttachmentLightbox — the full-size image viewer behind a thumbnail.
   * Ported from webapp ui/AttachmentThumbs.tsx (popover-family shell,
   * INTERACTION.md §9.2/§9.5): dimmed backdrop, Esc + backdrop-click
   * dismissal, scroll lock, focus to the close control and back to the
   * opener. With multiple images ←/→ cycle and a muted counter shows
   * position. Keys run in the capture phase so page-level shortcuts
   * (triage arrows, the shell's Esc) stay quiet while it's open.
   */
  import CloseButton from "./CloseButton.svelte";
  import { attachmentSrc } from "../../attachments";
  import "./AttachmentThumbs.css";

  export interface AttachmentThumb {
    id: string;
    filename: string;
  }

  let {
    attachments,
    index,
    onClose,
  }: {
    attachments: AttachmentThumb[];
    index: number;
    onClose: () => void;
  } = $props();

  let current = $state(index);
  let rootEl: HTMLDivElement | null = $state(null);
  let opener: HTMLElement | null = $state(null);
  const many = $derived(attachments.length > 1);
  const onCloseRef = $derived(onClose);

  $effect(() => {
    // SAFETY: DOM event target is guaranteed to be this element type in this handler.
    opener = document.activeElement as HTMLElement | null;
    rootEl?.querySelector<HTMLButtonElement>(".aa-lightbox__close")?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  });

  function onKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onCloseRef();
      return;
    }
    if (many && e.key === "ArrowLeft") {
      e.preventDefault();
      current = (current - 1 + attachments.length) % attachments.length;
      return;
    }
    if (many && e.key === "ArrowRight") {
      e.preventDefault();
      current = (current + 1) % attachments.length;
      return;
    }
    if (e.key === "Tab") {
      // Focus trap (§9.5): cycle the lightbox's own controls.
      const controls = rootEl?.querySelectorAll<HTMLButtonElement>("button");
      if (!controls || controls.length === 0) return;
      e.preventDefault();
      const list = Array.from(controls);
      // SAFETY: DOM event target is guaranteed to be this element type in this handler.
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.shiftKey
        ? at <= 0
          ? list.length - 1
          : at - 1
        : at === list.length - 1
          ? 0
          : at + 1;
      list[next]?.focus();
    }
  }

  function step(dir: 1 | -1): void {
    current = (current + dir + attachments.length) % attachments.length;
  }

  const chevronLeft =
    "M10 3.5L5.5 8l4.5 4.5";
  const chevronRight =
    "M6 3.5L10.5 8l-4.5 4.5";
</script>

<svelte:window onkeydowncapture={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div bind:this={rootEl} class="aa-lightbox" role="dialog" aria-modal="true" aria-label="Attached image" onclick={onClose}>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="aa-lightbox__stage" onclick={(e) => e.stopPropagation()}>
    <img
      class="aa-lightbox__img"
      src={attachmentSrc(attachments[current].id)}
      alt={attachments[current].filename}
    />
    <CloseButton onClose={onCloseRef} label="Close image" class="aa-lightbox__close" title="Close (Esc)" />
    {#if many}
      <button
        type="button"
        class="aa-lightbox__nav aa-lightbox__nav--prev"
        aria-label="Previous image"
        onclick={() => step(-1)}
      >
        <svg viewBox="0 0 16 16" fill="none"><path d={chevronLeft} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button
        type="button"
        class="aa-lightbox__nav aa-lightbox__nav--next"
        aria-label="Next image"
        onclick={() => step(1)}
      >
        <svg viewBox="0 0 16 16" fill="none"><path d={chevronRight} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <span class="aa-lightbox__count" aria-live="polite">
        {current + 1} / {attachments.length}
      </span>
    {/if}
  </div>
</div>
