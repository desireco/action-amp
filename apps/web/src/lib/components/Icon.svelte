<script lang="ts">
  /**
   * Icon — the small stroke-icon set the inbox + triage surfaces use,
   * ported from webapp/src/components/ui/icons.tsx (paths verbatim).
   * `size` is ems so icons scale with their label.
   */
  let { name, size = 14 }: { name: string; size?: number } = $props();

  const paths: Record<string, string> = {
    star: "M8 1.5l2 4.1 4.5.6-3.3 3.2.8 4.5L8 11.8l-4 2.1.8-4.5L1.5 6.2 6 5.6z",
    box: "M2.5 4.5h11v9h-11zM2.5 4.5L4 2.5h8l1.5 2",
    logbook: "M3.5 2.5h9v11h-9zM5.5 5.5h5M5.5 8h5M5.5 10.5h3",
    trash: "M3 4.5h10M6.5 2.5h3M5 4.5l.5 8h5l.5-8M6.7 6.5v4M9.3 6.5v4",
    projects: "M2 4.5h4l1.2 1.8H14v6.2H2zM2 4.5V3h4.5",
    calendar: "M3 4h10v9H3zM3 7h10M6 2.5V5M10 2.5V5",
    hash: "M6 2.5L4.8 13.5M11.2 2.5L10 13.5M2.8 5.8h10.4M2.3 10.2h10.4",
    "arrow-right": "M3 8h10M9.5 4.5L13 8l-3.5 3.5",
    chevron: "M6 4l4 4-4 4",
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  aria-hidden="true"
  class="aa-icon"
>
  <path
    d={paths[name] ?? ""}
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>

<style>
  .aa-icon {
    flex-shrink: 0;
    vertical-align: -0.125em;
  }
</style>
