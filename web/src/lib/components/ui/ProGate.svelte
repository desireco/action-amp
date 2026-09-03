<script lang="ts">
  /**
   * ProGate — the shared paywall-moment surface (S9 port of
   * webapp/src/components/ui/ProGate.tsx; S16 completes the deferred half:
   * the upgrade links + the `asTrigger` shape — this file's original header
   * said both "compose when the billing surface (S16) exists").
   *
   * Every free-tier cap renders through this one component so the tone never
   * drifts: calm, specific, honest — not a hard error, not a red dot. Two
   * shapes (webapp parity):
   *   1. Inline panel (default) — "{feature} is a Pro feature." + {reason} +
   *      upgrade links: primary → billing settings ("See plans"), secondary →
   *      the Founding 100 page ("Founding 100 · $99 lifetime"). Same pair
   *      every time.
   *   2. Trigger (asTrigger) — the at-cap create affordance: a quiet
   *      button-like link to billing ("Upgrade →") instead of a dead create
   *      button; the parent renders the panel on navigation back.
   *
   * No modals, no urgency tricks (PRODUCT.md). The lock mark is a quiet
   * key-cap (⌃ rotated 180° — reads as a roof), teal = system/state, per the
   * two-accent rule.
   */
  import "./ProGate.css"; // colocated; verbatim with webapp's ProGate.css

  let {
    feature,
    reason,
    asTrigger = false,
  }: { feature: string; reason: string; asTrigger?: boolean } = $props();
</script>

{#if asTrigger}
  <a
    href="/do/settings/billing"
    class="aa-progate-trigger"
    title="{feature} is a Pro feature"
  >
    <span class="aa-progate-trigger__label">{feature}</span>
    <span class="aa-progate-trigger__cta">Upgrade →</span>
  </a>
{:else}
  <div class="aa-progate">
    <p class="aa-progate__feature">
      <span class="aa-progate__lock" aria-hidden="true">⌃</span>
      {feature} is a Pro feature.
    </p>
    <p class="aa-progate__reason">{reason}</p>
    <div class="aa-progate__actions">
      <a href="/do/settings/billing" class="aa-progate__primary">See plans</a>
      <a href="/founding-100" class="aa-progate__secondary">
        Founding 100 · $99 lifetime
      </a>
    </div>
  </div>
{/if}
