<script lang="ts">
  /**
   * AttachmentThumbs — a calm row of captured-image thumbnails. Ported from
   * webapp ui/AttachmentThumbs.tsx. Clicking a thumb opens the
   * AttachmentLightbox instead of navigating away. The image is served by
   * /api/attachments/:id (owner-gated via the session cookie); rendering
   * the thumbs inline makes a separate "Image attached" chip redundant —
   * the image is the indicator.
   */
  import AttachmentLightbox from "./AttachmentLightbox.svelte";
  import { attachmentSrc } from "../../attachments";
  import "./AttachmentThumbs.css";

  let {
    attachments,
    size = "sm",
    resolveSrc = attachmentSrc,
  }: {
    attachments: { id: string; filename: string }[];
    size?: "xs" | "sm" | "md";
    /** The <img> src builder — overridable so Storybook can stub bytes. */
    resolveSrc?: typeof attachmentSrc;
  } = $props();

  let openIndex = $state<number | null>(null);
</script>

{#if attachments.length > 0}
  <div class="aa-attach-thumbs aa-attach-thumbs--{size}">
    {#each attachments as attachment, i (attachment.id)}
      <button
        type="button"
        class="aa-attach-thumbs__open"
        onclick={() => (openIndex = i)}
        aria-label="Open image {attachment.filename}"
        aria-haspopup="dialog"
        title={attachment.filename}
      >
        <img
          class="aa-attach-thumbs__img"
          src={resolveSrc(attachment.id)}
          alt={attachment.filename}
          loading="lazy"
        />
      </button>
    {/each}
    {#if openIndex !== null}
      <AttachmentLightbox
        attachments={attachments}
        index={openIndex}
        onClose={() => (openIndex = null)}
      />
    {/if}
  </div>
{/if}
