<script lang="ts">
  // CountLinkButton — quiet cross-surface nav with the destination's count.
  let {
    label,
    count,
    to,
  }: {
    label: string;
    count?: number;
    to: string;
  } = $props();
</script>

<a
  href={to}
  class="aa-count-link"
  title="Open {label}"
  aria-label="Open {label}, {count === undefined ? "loading" : count} {count === 1 ? "item" : "items"}"
>
  <span>{label}</span>
  <span class="aa-count-link__count" aria-hidden="true">{count ?? "—"}</span>
</a>

<style>
  .aa-count-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    color: var(--aa-text);
    text-decoration: none;
    font-size: var(--aa-text-sm);
    background: var(--aa-surface, transparent);
  }
  .aa-count-link:hover {
    border-color: var(--aa-teal);
  }
  .aa-count-link__count {
    font-weight: var(--aa-weight-semibold);
    color: var(--aa-teal-cta);
  }
</style>
