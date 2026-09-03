<script lang="ts">
  // CountLinkButton — quiet cross-surface nav with the destination's count.
  // Ported from webapp ui/CountLinkButton: a secondary sm Button-shaped link
  // (aa-btn classes) + CountLinkButton.css — verbatim with the legacy app's.
  import "./CountLinkButton.css";

  let {
    label,
    count,
    to,
  }: {
    label: string;
    /** Number of open items at the destination. Undefined means loading. */
    count?: number;
    to: string;
  } = $props();

  const countLabel = $derived(
    count === null || count === undefined
      ? "loading"
      : `${count} ${count === 1 ? "item" : "items"}`,
  );
</script>

<a
  href={to}
  class="aa-btn aa-btn--secondary aa-btn--sm aa-count-link-button"
  title="Open {label}"
  aria-label="Open {label}, {countLabel}"
>
  <span class="aa-btn__label">{label}</span>
  <span class="aa-count-link-button__count" aria-hidden="true">{count ?? "—"}</span>
</a>
