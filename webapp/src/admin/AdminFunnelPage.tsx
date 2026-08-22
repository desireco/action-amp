import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { getAdminFunnel, useQuery } from "wasp/client/operations";
import { AdminLayout } from "./AdminLayout";
import { Card, Table, type TableColumn } from "../components/ui";
import type { FunnelRange, FunnelStats } from "../analytics/operationsCore";
import "./AdminFunnelPage.css";

const RANGE_OPTIONS: Array<{ label: string; value: FunnelRange }> = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
];

const LABELS = new Map<string, string>([
  ["LANDING_VIEW", "Landing"],
  ["SIGNUP_COMPLETED", "Signup"],
  ["APP_OPENED", "App open"],
  ["CAPTURE_CREATED", "First capture"],
  ["TRIAGE_COMPLETED", "First triage"],
  ["CHECKOUT_STARTED", "Checkout"],
  ["PAYMENT_CONFIRMED", "Paid"],
]);

export function AdminFunnelPage() {
  const { data: user } = useAuth();
  const [params, setParams] = useSearchParams();
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  const range = params.get("range") === "7d" || params.get("range") === "all" ? params.get("range") as FunnelRange : "30d";
  const { data, isLoading, error } = useQuery(getAdminFunnel, { range });

  const sourceColumns = useMemo<TableColumn<FunnelStats["sources"][number]>[]>(() => [
    { key: "source", header: "Source" },
    { key: "sessions", header: "Sessions", align: "right" },
    { key: "signups", header: "Signups", align: "right" },
    { key: "checkouts", header: "Checkouts", align: "right" },
    { key: "payments", header: "Paid", align: "right" },
    { key: "conversionPct", header: "Visitor → paid", align: "right", render: (row) => row.conversionPct === null ? "—" : `${row.conversionPct}%` },
  ], []);

  if (!user?.isAdmin) return <AdminLayout><Card padding="lg"><p>You don't have access to this page.</p></Card></AdminLayout>;

  return (
    <AdminLayout>
      <div className="aa-admin-page-heading">
        <p className="aa-settings-eyebrow">Admin workspace</p>
        <h1 className="aa-settings-h">Funnel</h1>
        <p className="aa-admin-note">Where people move from first look to first payment.</p>
      </div>
      <div className="aa-admin-filter-row" aria-label="Funnel range">
        {RANGE_OPTIONS.map((option) => (
          <button key={option.value} type="button" className={`aa-admin-filter${range === option.value ? " active" : ""}`} aria-pressed={range === option.value} onClick={() => setParams({ range: option.value })}>{option.label}</button>
        ))}
      </div>
      {error && <Card padding="md" className="aa-admin-error"><p>{error.message}</p></Card>}
      <section className="aa-admin-funnel-section" aria-labelledby="funnel-path-heading">
        <div className="aa-admin-section-head"><h2 id="funnel-path-heading">Primary path</h2><span>{data?.range ?? range}</span></div>
        <div className="aa-admin-funnel-path">
          {(data?.funnel ?? LABELS_ORDER.map((name) => ({ name, count: 0, fromPreviousPct: null, fromLandingPct: null }))).map((step) => (
            <Card key={step.name} padding="md" className="aa-admin-funnel-step">
              <span className="aa-admin-funnel-step__count">{isLoading ? "—" : step.count.toLocaleString()}</span>
              <span className="aa-admin-funnel-step__label">{LABELS.get(step.name) ?? step.name}</span>
              <span className="aa-admin-funnel-step__rate">{step.fromPreviousPct === null ? "Start" : `${step.fromPreviousPct}% from prior`}</span>
            </Card>
          ))}
        </div>
      </section>
      <section className="aa-admin-funnel-section">
        <div className="aa-admin-section-head"><h2>Acquisition</h2><span>Grouped by source and campaign</span></div>
        <Table columns={sourceColumns} rows={data?.sources ?? []} rowKey={(row) => row.source} emptyMessage={isLoading ? "Loading acquisition…" : "No acquisition events in this range."} />
      </section>
      <section className="aa-admin-funnel-section">
        <div className="aa-admin-section-head"><h2>Retention</h2><span>D1 / D7 return rate</span></div>
        <Card padding="md" className="aa-admin-retention-card">
          <div><strong>{data?.retention.d1Pct === null ? "—" : `${data?.retention.d1Pct}%`}</strong><span>D1 return</span></div>
          <div><strong>{data?.retention.d7Pct === null ? "—" : `${data?.retention.d7Pct}%`}</strong><span>D7 return</span></div>
          {data?.retention.note && <p>{data.retention.note}</p>}
        </Card>
      </section>
      <p className="aa-admin-method-note">Anonymous acquisition context comes from StatCounter. Account-linked activation and payment events come from ActionAmp’s first-party event ledger.</p>
    </AdminLayout>
  );
}

const LABELS_ORDER = ["LANDING_VIEW", "SIGNUP_COMPLETED", "APP_OPENED", "CAPTURE_CREATED", "TRIAGE_COMPLETED", "CHECKOUT_STARTED", "PAYMENT_CONFIRMED"];
