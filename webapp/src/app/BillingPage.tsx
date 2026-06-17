import { useQuery, getBillingStatus, createCheckoutSession } from "wasp/client/operations";
import { useState } from "react";
import { SettingsLayout } from "./SettingsLayout";
import { PLAN_LABEL } from "../billing/config";
import "./BillingPage.css";

type PriceKey = "proYearly" | "proMonthly" | "proPrepaid";

const PLANS = [
  {
    id: "proMonthly" as PriceKey,
    name: "Monthly",
    price: "$12.95",
    priceCents: 1295,
    period: "/ month",
    pitch: "No commitment. Cancel anytime.",
    recommended: false,
  },
  {
    id: "proYearly" as PriceKey,
    name: "Yearly",
    price: "$79.50",
    priceCents: 7950,
    period: "/ year",
    pitch: "About a dollar-fifty a week.",
    badge: "Best value",
    recommended: true,
  },
  {
    id: "proPrepaid" as PriceKey,
    name: "Prepaid",
    price: "$90",
    priceCents: 9000,
    period: "/ year",
    pitch: "One year, no auto-renew.",
    recommended: false,
  },
];

export function BillingPage() {
  const { data, isLoading } = useQuery(getBillingStatus);
  const checkoutResult = new URLSearchParams(window.location.search).get("checkout");

  return (
    <SettingsLayout>
      {/* Checkout result banner */}
      {checkoutResult === "success" && (
        <section className="aa-billing-section">
          <div className="aa-billing-banner aa-billing-banner-success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Payment successful. Your plan is now active.
          </div>
        </section>
      )}
      {checkoutResult === "cancelled" && (
        <section className="aa-billing-section">
          <div className="aa-billing-banner aa-billing-banner-muted">
            Checkout cancelled. No changes to your plan.
          </div>
        </section>
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
      <PaymentHistory payments={data?.payments ?? []} loading={isLoading} />
    </SettingsLayout>
  );
}

/* ============================================================
   Active plan (PRO)
   ============================================================ */
function ActivePlanState({
  plan,
  planRenewsAt,
}: {
  plan: "FREE" | "PRO" | "FOUNDER";
  isFounder: boolean;
  planRenewsAt: Date | null;
}) {
  return (
    <section className="aa-billing-section">
      <div className="aa-billing-active">
        <div>
          <div className="aa-billing-active-badge">
            {PLAN_LABEL[plan]}
          </div>
          {planRenewsAt && (
            <p className="aa-billing-active-renewal">
              Renews {planRenewsAt.toLocaleDateString()}
            </p>
          )}
        </div>
        <button type="button" className="aa-billing-manage" disabled>
          Manage billing
        </button>
      </div>
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
      {/* Current tier */}
      <section className="aa-billing-section">
        <p className="aa-billing-current-tier">
          You're on <strong>Free</strong> · personal scope, 3 projects, 1 goal.
        </p>
      </section>

      {/* Plan picker */}
      <section className="aa-billing-section">
        <h2 className="aa-billing-heading">Upgrade to Pro</h2>
        <div className="aa-billing-grid">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className={`aa-billing-plan ${plan.recommended ? "recommended" : ""}`}
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
          ))}
        </div>
      </section>
    </>
  );
}

/* ============================================================
   Payment history
   ============================================================ */
function PaymentHistory({
  payments,
  loading,
}: {
  payments: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    status: string;
    paidAt: Date | null;
  }[];
  loading: boolean;
}) {
  return (
    <section className="aa-billing-section">
      <h2 className="aa-billing-heading">Payment history</h2>
      {loading ? (
        <p className="aa-billing-state">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="aa-billing-empty">No payments yet.</p>
      ) : (
        <table className="aa-billing-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.paidAt ? p.paidAt.toLocaleDateString() : "—"}</td>
                <td>{p.description}</td>
                <td>{formatAmount(p.amount, p.currency)}</td>
                <td>
                  <span className={`aa-billing-pill aa-billing-pill-${p.status.toLowerCase()}`}>
                    {p.status.toLowerCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
