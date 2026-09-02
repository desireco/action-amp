<script lang="ts">
  // BillingPage — the Billing tab (S16 port of webapp/src/app/BillingPage.tsx,
  // same look + behaviors: checkout banners, the current-plan card, the
  // 3-card upgrade grid, and the payment history table). FREE → upgrade
  // screen; PRO/FOUNDER → plan badge + "Update payment in Stripe" (the
  // Customer Portal); expired PRO is NOT this page's state — isPaid keys off
  // the plan field, and expiry is handled by isPlanActive at the gates.
  //
  // The client never mutates the plan: buttons create Stripe sessions and
  // redirect. The webhook is the source of truth (BILLING-INTEGRATION.md).
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import Chip from "../../../../lib/components/Chip.svelte";
  import { billing } from "../../../../lib/stores/billing.svelte";
  import "../../../../lib/styles/billing.css";

  // Client copy of @actionamp/domain billing/config PLAN_LABEL (the web app
  // doesn't import the domain package — keep in sync with config.ts).
  const PLAN_LABEL: Record<"FREE" | "PRO" | "FOUNDER", string> = {
    FREE: "Free",
    PRO: "Pro",
    FOUNDER: "Founding Member",
  };

  type PriceKey = "proMonthly" | "proYearly" | "proPrepaid";

  const PLANS: Array<{
    id: PriceKey;
    name: string;
    price: string;
    period: string;
    pitch: string;
    badge?: string;
    recommended?: boolean;
  }> = [
    {
      id: "proMonthly",
      name: "Monthly",
      price: "$12.95",
      period: "/ month",
      pitch: "No commitment. Cancel anytime.",
      recommended: false,
    },
    {
      id: "proYearly",
      name: "Yearly",
      price: "$79.50",
      period: "/ year",
      pitch: "About a dollar-fifty a week.",
      badge: "Best value",
      recommended: true,
    },
    {
      id: "proPrepaid",
      name: "Prepaid",
      price: "$90",
      period: "/ year",
      pitch: "One year, no auto-renew.",
      recommended: false,
    },
  ];

  const status = $derived(billing.status);
  const checkoutResult = $derived(page.url.searchParams.get("checkout"));

  onMount(() => {
    void billing.loadStatus();
  });

  function formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleDateString() : "—";
  }

  function formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  }

  function statusVariant(status: string): "teal" | "rose" | "muted" {
    return status === "SUCCEEDED"
      ? "teal"
      : status === "FAILED" || status === "REFUNDED"
        ? "rose"
        : "muted";
  }

  async function handleCheckout(priceKey: PriceKey) {
    // Errors surface as console noise only (webapp parity — no guilt-trip
    // error states on the Billing tab); the button un-hangs via the store.
    await billing.checkout(priceKey).catch(console.error);
  }

  async function handleManage() {
    await billing.openPortal().catch(console.error);
  }

  // The webapp's ActivePlanState/FreeUpgradeScreen, as fragments.
  const isPaid = $derived(status?.isPaid ?? false);
  const payments = $derived(status?.payments ?? []);
</script>

{#if checkoutResult === "success"}
  <div class="aa-card aa-card--pad-sm aa-billing-banner-card">
    <span class="aa-billing-banner-success">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      Payment successful. Your plan is now active.
    </span>
  </div>
{:else if checkoutResult === "cancelled"}
  <div class="aa-card aa-card--pad-sm aa-billing-banner-card">
    <span class="aa-billing-banner-muted">
      Checkout cancelled. No changes to your plan.
    </span>
  </div>
{/if}

{#if !status}
  <p class="aa-billing-state">Loading…</p>
{:else if isPaid}
  <!-- Current plan (PRO / FOUNDER) -->
  <section class="aa-billing-section">
    <div class="aa-settings-section-head">
      <h2 class="aa-settings-sh">Current plan</h2>
      <p class="aa-settings-note">
        Manage subscription, payment method, invoices, and cancellation through Stripe.
      </p>
    </div>
    <div class="aa-card aa-card--pad-md aa-billing-current-card">
      <div class="aa-billing-active">
        <div>
          <div class="aa-billing-active-title">
            <Chip variant="teal">{PLAN_LABEL[status.plan]}</Chip>
            <span>Active</span>
          </div>
          {#if status.planRenewsAt}
            <p class="aa-billing-active-renewal">
              Renews {formatDate(status.planRenewsAt)}
            </p>
          {:else if status.isFounder}
            <p class="aa-billing-active-renewal">Lifetime access</p>
          {/if}
        </div>
        <button
          class="aa-btn-secondary-sm"
          onclick={handleManage}
          disabled={billing.portalLoading}
        >
          {billing.portalLoading ? "Opening…" : "Update payment in Stripe"}
        </button>
      </div>
    </div>
  </section>
{:else}
  <!-- Free user — current plan + upgrade grid -->
  <section class="aa-billing-section">
    <div class="aa-settings-section-head">
      <h2 class="aa-settings-sh">Current plan</h2>
      <p class="aa-settings-note">Your access and billing status.</p>
    </div>
    <div class="aa-card aa-card--pad-md aa-billing-current-card">
      <div class="aa-billing-active">
        <div>
          <div class="aa-billing-active-title">
            <Chip variant="muted">Free</Chip>
            <span>Free plan</span>
          </div>
          <p class="aa-billing-active-renewal">
            Personal scope · 3 projects · 1 goal
          </p>
        </div>
        <span class="aa-billing-payment-state">No payment method</span>
      </div>
    </div>
  </section>

  <section class="aa-billing-section">
    <div class="aa-settings-section-head">
      <h2 class="aa-settings-sh">Upgrade to Pro</h2>
      <p class="aa-settings-note">Pick a plan. Checkout opens in Stripe.</p>
    </div>
    <div class="aa-billing-grid">
      {#each PLANS as plan (plan.id)}
        <div
          class="aa-card aa-card--pad-lg aa-billing-plan-card {plan.recommended
            ? 'aa-card--highlighted'
            : 'aa-card--interactive'}"
        >
          <button
            type="button"
            class="aa-billing-plan"
            disabled={billing.checkoutLoading !== null}
            onclick={() => handleCheckout(plan.id)}
            aria-label={`Choose ${plan.name} Pro for ${plan.price} ${plan.period}`}
          >
            <div class="aa-billing-plan-head">
              <span class="aa-billing-plan-name">{plan.name}</span>
              {#if plan.badge}
                <span class="aa-billing-plan-badge">{plan.badge}</span>
              {/if}
            </div>
            <div class="aa-billing-plan-price">
              <span class="aa-billing-plan-amount">{plan.price}</span>
              <span class="aa-billing-plan-period">{plan.period}</span>
            </div>
            <p class="aa-billing-plan-pitch">{plan.pitch}</p>
            <span class="aa-billing-plan-cta">
              {billing.checkoutLoading === plan.id
                ? "Opening checkout…"
                : `Choose ${plan.name.toLowerCase()}`}
              {#if billing.checkoutLoading !== plan.id}
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 8h9M9 4.5 12.5 8 9 11.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
            </span>
          </button>
        </div>
      {/each}
    </div>
  </section>
{/if}

<!-- Payment history -->
<section class="aa-billing-section">
  <div class="aa-settings-section-head">
    <h2 class="aa-settings-sh">Payment history</h2>
    <p class="aa-settings-note">Receipts recorded after Stripe confirms payment.</p>
  </div>
  <div class="aa-billing-history">
    {#if payments.length === 0}
      <div class="aa-billing-empty">No payments yet.</div>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Plan</th>
            <th class="th-right">Amount</th>
            <th class="td-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {#each payments as p (p.id)}
            <tr>
              <td>{formatDate(p.paidAt)}</td>
              <td>{p.description}</td>
              <td class="td-right">{formatAmount(p.amount, p.currency)}</td>
              <td class="td-center">
                <Chip variant={statusVariant(p.status)} small>
                  {p.status.toLowerCase()}
                </Chip>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>
