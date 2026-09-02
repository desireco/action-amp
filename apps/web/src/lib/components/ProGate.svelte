<script lang="ts">
  /**
   * ProGate — the shared paywall-moment surface (S9 port of
   * webapp/src/components/ui/ProGate.tsx, inline-panel shape; the `asTrigger`
   * shape is billing-surface work and lands with its consumer).
   *
   * Every free-tier cap renders through this one component so the tone never
   * drifts: calm, specific, honest — not a hard error, not a red dot. The
   * palette's FREE gate renders it with the sitewide-search copy; the trigger
   * shape + upgrade links compose when the billing surface (S16) exists.
   * The lock mark is a quiet key-cap (⌃ rotated 180° — reads as a roof),
   * teal = system/state, per the two-accent rule.
   */
  import "../styles/ProGate.css";

  let { feature, reason }: { feature: string; reason: string } = $props();
</script>

<div class="aa-progate">
  <p class="aa-progate__feature">
    <span class="aa-progate__lock" aria-hidden="true">⌃</span>
    {feature} is a Pro feature.
  </p>
  <p class="aa-progate__reason">{reason}</p>
</div>
