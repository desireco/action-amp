/**
 * Billing store — the S16 client (F9a class-singleton pattern): the Billing
 * tab's status read, the checkout/portal redirects, and the plan data the
 * ProGate upgrade path links to. All server contact goes through the client
 * in `../api`.
 *
 * The `BillingClientSlice` mirrors the contract's billing procedures
 * structurally (the same bridge the prefs/public stores use): the shared
 * client's type gains `billing` when the composition line in
 * docs/plans/slices/s16-wiring.md lands; this slice keeps the store
 * typechecking either way.
 */
import { client } from "../api";
import type { BillingStatus, CheckoutPriceKey } from "@actionamp/contract";

interface BillingClientSlice {
  createCheckoutSession(input: {
    priceKey: CheckoutPriceKey;
  }): Promise<{ url: string }>;
  createCustomerPortalSession(): Promise<{ url: string }>;
  getBillingStatus(): Promise<BillingStatus>;
}

const rpc = (client as unknown as { billing: BillingClientSlice }).billing;

class BillingStore {
  /** The Billing tab data (plan + payment history). */
  status = $state<BillingStatus | null>(null);
  /** Which plan card is opening checkout (drives the per-card "Opening…" state). */
  checkoutLoading = $state<CheckoutPriceKey | null>(null);
  portalLoading = $state(false);

  /** Load (or reload) the billing status. Errors leave the previous value —
   *  the page renders the honest empty state. */
  async loadStatus(): Promise<BillingStatus | null> {
    try {
      this.status = await rpc.getBillingStatus();
    } catch {
      /* keep the previous value / null */
    }
    return this.status;
  }

  /**
   * Open Stripe Checkout for a plan key — redirect the browser to the hosted
   * session (webapp parity: window.location.href). Never mutates the plan
   * client-side; the webhook is the source of truth.
   */
  async checkout(priceKey: CheckoutPriceKey): Promise<void> {
    this.checkoutLoading = priceKey;
    try {
      const result = await rpc.createCheckoutSession({ priceKey });
      if (result.url) {
        window.location.href = result.url;
      }
      // A missing URL (shouldn't happen — the server throws first) resets below.
    } finally {
      this.checkoutLoading = null;
    }
  }

  /** Open the Stripe Customer Portal (manage/cancel/card/invoices). */
  async openPortal(): Promise<void> {
    this.portalLoading = true;
    try {
      const result = await rpc.createCustomerPortalSession();
      if (result.url) {
        window.location.href = result.url;
      }
    } finally {
      this.portalLoading = false;
    }
  }
}

export const billing = new BillingStore();
