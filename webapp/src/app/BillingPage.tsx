import { useQuery, getBillingStatus, createCheckoutSession, createCustomerPortalSession } from "wasp/client/operations";
import { useState } from "react";
import { SettingsLayout } from "./SettingsLayout";
import { Button, Card, Chip, Table, type TableColumn } from "../components/ui";
import { PLAN_LABEL } from "../billing/config";
import "./BillingPage.css";

type PriceKey = "proYearly" | "proMonthly" | "proPrepaid";

const PLANS = [
  {
    id: "proMonthly" as PriceKey,
    name: "Monthly",
    price: "$12.95",
    period: "/ month",
    pitch: "No commitment. Cancel anytime.",
    recommended: false,
  },
  {
    id: "proYearly" as PriceKey,
    name: "Yearly",
    price: "$79.50",
    period: "/ year",
    pitch: "About a dollar-fifty a week.",
    badge: "Best value",
    recommended: true,
  },
  {
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
      <Card padding="lg">
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
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleCheckout = async (priceKey: PriceKey) => {
    setCheckoutLoading(true);
    try {
      const result = await createCheckoutSession({ priceKey });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setCheckoutLoading(false);
    }
  };

  return (
    <>
      <section className="aa-billing-section">
        <div className="aa-settings-section-head">
          <h2 className="aa-settings-sh">Current plan</h2>
          <p className="aa-settings-note">Free includes personal scope, 3 projects, and 1 goal.</p>
        </div>
        <Card padding="lg">
          <div className="aa-billing-active">
            <div className="aa-billing-active-title">
              <Chip variant="muted">Free</Chip>
              <span>No payment method on file</span>
            </div>
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
                disabled={checkoutLoading}
                onClick={() => handleCheckout(plan.id)}
              >
                {plan.badge && <span className="aa-billing-plan-badge">{plan.badge}</span>}
                <div className="aa-billing-plan-price">
                  <span className="aa-billing-plan-amount">{plan.price}</span>
                  <span className="aa-billing-plan-period">{plan.period}</span>
                </div>
                <div className="aa-billing-plan-name">{plan.name}</div>
                <div className="aa-billing-plan-pitch">{plan.pitch}</div>
                <span className="aa-billing-plan-cta">
                  {checkoutLoading ? "Opening checkout…" : "Choose plan"}
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
  return <Chip variant={variant as "teal" | "rose" | "muted"} small>{status.toLowerCase()}</Chip>;
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
