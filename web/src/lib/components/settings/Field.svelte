<script lang="ts" module>
  // Field — a label/value row used throughout Settings. Ported from
  // webapp/src/app/Field.tsx (+ ui/Toggle). Variants:
  //   - value: read-only label + value (email, name)
  //   - toggle: label + description on the left, a Toggle on the right
  //   - custom: label + arbitrary children (steppers, time inputs)
  import type { Snippet } from "svelte";

  interface FieldToggle {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  let {
    label,
    description,
    children,
    value,
    valueSnippet,
    toggle,
  }: {
    label: string;
    description?: string;
    children?: Snippet;
    /** For the value variant (plain text) */
    value?: unknown;
    /** For the value variant (markup, e.g. the Built By link) */
    valueSnippet?: Snippet;
    /** For the toggle variant */
    toggle?: FieldToggle;
  } = $props();
</script>

<div class="aa-field">
  <div class="aa-field__text">
    <span class="aa-field__label">{label}</span>
    {#if description}<span class="aa-field__desc">{description}</span>{/if}
  </div>
  {#if toggle}
    <button
      type="button"
      role="switch"
      aria-checked={toggle.checked}
      aria-label={label}
      class="aa-toggle"
      class:aa-toggle--on={toggle.checked}
      class:aa-toggle--disabled={toggle.disabled}
      disabled={toggle.disabled}
      onclick={() => !toggle?.disabled && toggle?.onChange(!toggle.checked)}
    >
      <span class="aa-toggle__thumb"></span>
    </button>
  {/if}
  {#if valueSnippet}
    <span class="aa-field__value">{@render valueSnippet()}</span>
  {:else if value !== undefined}
    <span class="aa-field__value">{value}</span>
  {/if}
  {@render children?.()}
</div>
