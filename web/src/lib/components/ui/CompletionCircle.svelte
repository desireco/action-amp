<script lang="ts">
  /**
   * CompletionCircle — the signature completion circle. Ported from webapp
   * ui/CompletionCircle (classes + CompletionCircle.css verbatim): empty
   * border → filled teal + check. sm = 20px (lists), md = 32px (hero
   * cards), lg = 44px (empty states).
   */
  import "./CompletionCircle.css";

  let {
    filled = false,
    size = "sm",
    disabled = false,
    onclick,
    burst = false,
    pulse = false,
  }: {
    filled?: boolean;
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    onclick?: () => void;
    /** One-shot burst animation (hero completion). */
    burst?: boolean;
    /** Pulsing halo (hero Next card). */
    pulse?: boolean;
  } = $props();

  const cls = $derived(
    [
      "aa-cc",
      `aa-cc--${size}`,
      filled ? "aa-cc--filled" : "",
      disabled ? "aa-cc--disabled" : "",
      burst ? "aa-cc--burst" : "",
      pulse ? "aa-cc--pulse" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
</script>

<button
  type="button"
  class={cls}
  disabled={disabled}
  onclick={disabled ? undefined : onclick}
  aria-label={filled ? "Completed" : "Mark complete"}
  aria-pressed={filled}
>
  <svg class="aa-cc__check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M3.5 8.5l3 3 6-7"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</button>
