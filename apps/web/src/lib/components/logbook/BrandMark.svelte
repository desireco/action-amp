<script lang="ts">
  /**
   * BrandMark — the teal checkmark icon used everywhere (webapp
   * ui/BrandMark port). Three sizes: sm (12px), md (15px, default),
   * lg (20px).
   */
  let { size = "md" }: { size?: "sm" | "md" | "lg" } = $props();

  const sizeMap = { sm: 12, md: 15, lg: 20 } as const;
  const dim = $derived(sizeMap[size]);
</script>

<svg
  width={dim}
  height={dim}
  viewBox="0 0 16 16"
  fill="none"
  class="aa-brand-mark"
  aria-hidden="true"
>
  <path
    d="M3.5 8.5l3 3 6-7"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
