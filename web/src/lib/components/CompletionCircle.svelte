<script lang="ts">
  // CompletionCircle — the quiet done ring (empty-state icon, Today's mark).
  let { size = 40 }: { size?: number } = $props();
  const r = 45;
  const circumference = 2 * Math.PI * r;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 100 100"
  role="img"
  aria-label="Completed"
  class="aa-completion-circle"
>
  <circle cx="50" cy="50" {r} fill="none" stroke="var(--aa-border, oklch(0.9 0.005 240))" stroke-width="6" />
  <circle
    cx="50"
    cy="50"
    {r}
    fill="none"
    stroke="var(--aa-teal)"
    stroke-width="6"
    stroke-linecap="round"
    stroke-dasharray={circumference}
    stroke-dashoffset={circumference * 0.25}
    transform="rotate(-90 50 50)"
  />
</svg>

<style>
  .aa-completion-circle {
    display: block;
  }
</style>
