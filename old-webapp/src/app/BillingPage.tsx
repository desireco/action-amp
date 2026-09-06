import { useQuery, getBillingStatus, createCheckoutSession, createCustomerPortalSession } from "wasp/client/operations";
import { useState } from "react";
import { SettingsLayout } from "./SettingsLayout";
import { trackStatCounterEvent } from "../analytics/StatCounter";
import { Button, Card, Chip, Table, type TableColumn } from "../components/ui";
import { PLAN_LABEL } from "../billing/config";
import "./BillingPage.css";

type PriceKey = "proYearly" | "proMonthly" | "proPrepaid";

const PLANS = [
  {
    // SAFETY: type assertion is safe — value is validated or from a trusted source.
    id: "proMonthly" as PriceKey,
    name: "Monthly",
    price: "$12.95",
    period: "/ month",
    pitch: "No commitment. Cancel anytime.",
    recommended: false,
  },
  {
    // SAFETY: type assertion is safe — value is validated or from a trusted source.
    id: "proYearly" as PriceKey,
    name: "Yearly",
    price: "$79.50",
    period: "/ year",
    pitch: "About a dollar-fifty a week.",
    badge: "Best value",
    recommended: true,
  },
  {
    // SAFETY: type assertion is safe — value is validated or from a trusted source.
    id: "proPrepaid" as PriceKey,
    name: "Prepaid",
    price: "$90",
    period: "/ year",
    pitch: "One year, no auto-renew.",
    recommended: false,
  },
];

interface PaymentRow {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: Date | null;
}

export function BillingPage() {
  const { data, isLoading } = useQuery(getBillingStatus);
  const checkoutResult = new URLSearchParams(window.location.search).get("checkout");

  const paymentColumns: TableColumn<PaymentRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (p) => (p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"),
    },
    { key: "description", header: "Plan" },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (p) => formatAmount(p.amount, p.currency),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (p) => <StatusPill status={p.status} />,
    },
  ];

  return (
    <SettingsLayout>
      {/* Checkout result banner */}
      {checkoutResult === "success" && (
        <Card variant="highlighted" padding="sm" className="aa-billing-banner-card">
          <span className="aa-billing-banner-success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Payment successful. Your plan is now active.
          </span>
        </Card>
      )}
      {checkoutResult === "cancelled" && (
        <Card padding="sm" className="aa-billing-banner-card">
          <span className="aa-billing-banner-muted">Checkout cancelled. No changes to your plan.</span>
        </Card>
      )}

      {/* Current plan state */}
      {isLoading ? (
        <p className="aa-billing-state">Loading…</p>
      ) : data?.isPaid ? (
        <ActivePlanState
          plan={data.plan}
          isFounder={data.isFounder}
          planRenewsAt={data.planRenewsAt}
        />
      ) : (
        <FreeUpgradeScreen />
      )}

      {/* Payment history */}
      <section className="aa-billing-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">Payment history</h2>
          <p className="aa-settings-note">Receipts recorded after Stripe confirms payment.</p>
        </div>
        <Table
          columns={paymentColumns}
          rows={data?.payments ?? []}
          rowKey={(p) => p.id}
          emptyMessage="No payments yet."
          className="aa-billing-history"
        />
      </section>
    </SettingsLayout>
  );
}

/* ============================================================
   Active plan (PRO)
   ============================================================ */
function ActivePlanState({
  plan,
  isFounder,
  planRenewsAt,
}: {
  plan: "FREE" | "PRO" | "FOUNDER";
  isFounder: boolean;
  planRenewsAt: Date | null;
}) {
  const [portalLoading, setPortalLoading] = useState(false);

  const handleManage = async () => {
    setPortalLoading(true);
    try {
      const result = await createCustomerPortalSession();
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      console.error("Portal error:", err);
      setPortalLoading(false);
    }
  };

  return (
    <section className="aa-billing-section">
      <div className="aa-settings-section-head">
        <h2 className="aa-settings-sh">Current plan</h2>
        <p className="aa-settings-note">
          Manage subscription, payment method, invoices, and cancellation through Stripe.
        </p>
      </div>
      <Card padding="md" className="aa-billing-current-card">
        <div className="aa-billing-active">
          <div>
            <div className="aa-billing-active-title">
              <Chip variant="teal">{PLAN_LABEL[plan]}</Chip>
              <span>Active</span>
            </div>
            {planRenewsAt ? (
              <p className="aa-billing-active-renewal">
                Renews {new Date(planRenewsAt).toLocaleDateString()}
              </p>
            ) : isFounder ? (
              <p className="aa-billing-active-renewal">Lifetime access</p>
            ) : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleManage}
            disabled={portalLoading}
          >
            {portalLoading ? "Opening…" : "Update payment in Stripe"}
          </Button>
        </div>
      </Card>
    </section>
  );
}

/* ============================================================
   Free user — upgrade screen
   ============================================================ */
function FreeUpgradeScreen() {
  const [checkoutLoading, setCheckoutLoading] = useState<PriceKey | null>(null);

  const handleCheckout = async (priceKey: PriceKey) => {
    setCheckoutLoading(priceKey);
    try {
      const result = await createCheckoutSession({ priceKey });
      if (result.url) {
        trackStatCounterEvent("checkout_started", "billing", priceKey);
        window.location.href = result.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setCheckoutLoading(null);
    }
  };

  return (
    <>
      <section className="aa-billing-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">Current plan</h2>
          <p className="aa-settings-note">Your access and billing status.</p>
        </div>
        <Card padding="md" className="aa-billing-current-card">
          <div className="aa-billing-active">
            <div>
              <div className="aa-billing-active-title">
                <Chip variant="muted">Free</Chip>
                <span>Free plan</span>
              </div>
              <p className="aa-billing-active-renewal">
                Personal scope · 3 projects · 1 goal
              </p>
            </div>
            <span className="aa-billing-payment-state">No payment method</span>
          </div>
        </Card>
      </section>

      <section className="aa-billing-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">Upgrade to Pro</h2>
          <p className="aa-settings-note">Pick a plan. Checkout opens in Stripe.</p>
        </div>
        <div className="aa-billing-grid">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              variant={plan.recommended ? "highlighted" : "interactive"}
              padding="lg"
              className="aa-billing-plan-card"
            >
              <button
                type="button"
                className="aa-billing-plan"
                disabled={checkoutLoading !== null}
                onClick={() => handleCheckout(plan.id)}
                aria-label={`Choose ${plan.name} Pro for ${plan.price} ${plan.period}`}
              >
                <div className="aa-billing-plan-head">
                  <span className="aa-billing-plan-name">{plan.name}</span>
                  {plan.badge && <span className="aa-billing-plan-badge">{plan.badge}</span>}
                </div>
                <div className="aa-billing-plan-price">
                  <span className="aa-billing-plan-amount">{plan.price}</span>
                  <span className="aa-billing-plan-period">{plan.period}</span>
                </div>
                <p className="aa-billing-plan-pitch">{plan.pitch}</p>
                <span className="aa-billing-plan-cta">
                  {checkoutLoading === plan.id ? "Opening checkout…" : `Choose ${plan.name.toLowerCase()}`}
                  {checkoutLoading !== plan.id && (
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8h9M9 4.5 12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}

/* ============================================================
   Status pill (table cell)
   ============================================================ */
function StatusPill({ status }: { status: string }) {
  const variant =
    status === "SUCCEEDED" ? "teal" :
    status === "FAILED" || status === "REFUNDED" ? "rose" :
    "muted";
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  return <Chip variant={variant as "teal" | "rose" | "muted"} small>{status.toLowerCase()}</Chip>;
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
