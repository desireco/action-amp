<script lang="ts">
  /**
   * AttachmentCover — the inbox row's left-side media preview. Ported from
   * webapp ui/AttachmentThumbs.tsx. One square cover (first image) so the
   * image reads as part of the row, "+N" badge when more follow. Click
   * opens the lightbox; `object-fit: cover` keeps the row tidy — the
   * lightbox shows the full, uncropped image.
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

  let open = $state(false);
  const first = $derived(attachments[0]);
</script>

{#if attachments.length > 0}
  <button
    type="button"
    class="aa-attach-cover"
    onclick={() => (open = true)}
    aria-label="Open image {first.filename}"
    aria-haspopup="dialog"
    title={attachments.length > 1 ? `${attachments.length} images — ${first.filename}` : first.filename}
  >
    <img
      class="aa-attach-cover__img"
      src={resolveSrc(first.id)}
      alt={first.filename}
      loading="lazy"
    />
    {#if attachments.length > 1}
      <span class="aa-attach-cover__count">+{attachments.length - 1}</span>
    {/if}
  </button>
  {#if open}
    <AttachmentLightbox attachments={attachments} index={0} onClose={() => (open = false)} />
  {/if}
{/if}
