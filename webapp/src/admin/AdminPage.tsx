import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { useQuery, useAction, getAdminStats, getRecentFeedback, updateFeedbackStatus, deleteFeedback } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "./AdminLayout";
import { Button, Card, Chip, DesktopIcon, PhoneIcon, TabletIcon, Table, type TableColumn } from "../components/ui";
import type { FeedbackRow } from "./operationsCore";
import type { FeedbackStatus } from "../feedback/operationsCore";
import type { FunnelRange } from "../analytics/operationsCore";
import { StatusSelect } from "./StatusSelect";
import "./AdminPage.css";

function relativeTime(iso: string | Date): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function Tile({ value, label, sub, to, icon, emphasized = false }: { value: number | null; label: string; sub?: string; to?: string; icon?: ReactNode; emphasized?: boolean }) {
  const loading = value === null;
  const number = <span className={`aa-admin-tile__num ${loading ? "aa-admin-tile__num--placeholder" : ""} ${emphasized ? "aa-admin-tile__num--emphasized" : ""}`}>{loading ? "—" : value!.toLocaleString()}</span>;
  return (
    <Card padding="md" className="aa-admin-tile">
      {icon ? <div className="aa-admin-tile__metric">{number}<span className="aa-admin-tile__icon" aria-hidden="true">{icon}</span></div> : number}
      {to ? <Link className="aa-admin-tile__label" to={to}>{label}</Link> : <span className="aa-admin-tile__label">{label}</span>}
      {sub && <span className="aa-admin-tile__sub">{sub}</span>}
    </Card>
  );
}

const RANGE_OPTIONS: Array<{ label: string; value: FunnelRange }> = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
];

const FUNNEL_LABELS: Record<string, string> = {
  LANDING_VIEW: "Landing", SIGNUP_COMPLETED: "Signup", APP_OPENED: "App open",
  CAPTURE_CREATED: "Capture", TRIAGE_COMPLETED: "Triage", CHECKOUT_STARTED: "Checkout", PAYMENT_CONFIRMED: "Paid",
};

export function AdminPage() {
  const { data: user } = useAuth();
  const [params, setParams] = useSearchParams();
  const range = params.get("range") === "7d" || params.get("range") === "all" ? params.get("range") as FunnelRange : "30d";

  const { data: stats, isLoading: statsLoading, error: statsError, dataUpdatedAt } = useQuery(getAdminStats, { range });
  // Recent feedback with "Show more". The first page always loads; appended
  // pages accumulate in state so repeated clicks don't drop intermediate pages.
  // `fetchAfterId` is the pending cursor (set on click, cleared once the page
  // is appended) — the next-page query only runs while a fetch is pending.
  const [appended, setAppended] = useState<FeedbackRow[]>([]);
  const [fetchAfterId, setFetchAfterId] = useState<string | null>(null);
  // Whether the most recently appended page had a next page. Defaults to the
  // first page's signal until something is appended.
  const [appendedHasNext, setAppendedHasNext] = useState<boolean | null>(null);
  const { data: firstPage } = useQuery(getRecentFeedback, { afterId: null, limit: 10 });
  const { data: fetchedPage, isLoading: moreLoading } = useQuery(
    getRecentFeedback,
    fetchAfterId ? { afterId: fetchAfterId, limit: 10 } : undefined,
    { enabled: !!fetchAfterId },
  );

  // When a "Show more" fetch resolves, commit its items to `appended`, record
  // its hasNext boundary, and clear the pending cursor so the query idles.
  useEffect(() => {
    if (fetchAfterId && fetchedPage) {
      setAppended((prev) => [...prev, ...fetchedPage.items]);
      setAppendedHasNext(fetchedPage.hasNext);
      setFetchAfterId(null);
    }
  }, [fetchAfterId, fetchedPage]);

  if (!user?.isAdmin) {
    return (
      <AdminLayout>
        <Card padding="lg">
          <p>You don't have access to this page.</p>
        </Card>
      </AdminLayout>
    );
  }

  if (statsError) {
    return (
      <AdminLayout>
        <Card padding="lg" className="aa-admin-error">
          <p>{statsError.message}</p>
        </Card>
      </AdminLayout>
    );
  }

  const u = stats?.users;
  const f = stats?.feedback;
  const num = (n: number | null | undefined) => (statsLoading || n === undefined || n === null ? null : n);

  // Accumulate feedback items: first page + every appended page.
  const items: FeedbackRow[] = [
    ...(firstPage?.items ?? []),
    ...appended,
  ];
  // hasNext reflects the most recently appended page's boundary, falling back
  // to the first page's signal before any "Show more" has been clicked.
  const hasNext = appendedHasNext ?? (firstPage?.hasNext ?? false);

  // Inline status update: fire the action, then invalidate the feedback list
  // (all pages) + the stats (by-status counts). The app uses invalidate-and-
  // refetch, not optimistic updates — the row briefly shows the old status
  // until the refetch lands. Errors are logged; the picker resets its pending
  // state and the stale row stays (no silent local mutation).
  const updateStatusAction = useAction(updateFeedbackStatus);
  const deleteAction = useAction(deleteFeedback);
  const queryClient = useQueryClient();
  async function handleStatusChange(id: string, status: FeedbackStatus) {
    try {
      await updateStatusAction({ id, status });
      await queryClient.invalidateQueries({ queryKey: ["getRecentFeedback"] });
      await queryClient.invalidateQueries({ queryKey: ["getAdminStats"] });
    } catch (err) {
      console.error("[admin] status update failed:", err);
    }
  }
  // Soft-delete: the row disappears from the list + the byStatus counts once
  // both refetches land. Same invalidate pattern as the status change.
  async function handleDelete(id: string) {
    try {
      await deleteAction({ id });
      await queryClient.invalidateQueries({ queryKey: ["getRecentFeedback"] });
      await queryClient.invalidateQueries({ queryKey: ["getAdminStats"] });
    } catch (err) {
      console.error("[admin] delete failed:", err);
    }
  }

  const feedbackColumns: TableColumn<FeedbackRow>[] = [
    {
      key: "status",
      header: "Status",
      render: (r) => (
            <StatusSelect
              status={r.status}
              onStatusChange={(s) => handleStatusChange(r.id, s)}
              onDelete={() => handleDelete(r.id)}
            />
      ),
    },
    { key: "message", header: "Message", render: (r) => r.message.split("\n")[0].slice(0, 80) },
    {
      key: "route",
      header: "Route",
      render: (r) => {
        // Lens prefix (what the user thinks in) + the path they were on.
        // section (work/plan/review) is captured but not shown — it's a
        // URL-derived bucket that's almost always "work" (the default) and
        // reads as noise next to the lens. Full context in the title.
        if (!r.route && !r.lensName) return "—";
        const title = [
          r.lensName ? `lens: ${r.lensName}` : null,
          r.section ? `section: ${r.section}` : null,
          r.route ? `route: ${r.route}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        return (
          <span className="aa-admin-feedback-route" title={title}>
            {r.lensName && (
              <span className="aa-admin-feedback-route__lens">
                {r.lensColor && (
                  <span
                    className="aa-admin-feedback-route__lens-dot"
                    style={{ background: r.lensColor }}
                    aria-hidden="true"
                  />
                )}
                {r.lensName}
              </span>
            )}
            {r.route && <span className="aa-admin-feedback-route__path">{r.route}</span>}
          </span>
        );
      },
    },
    {
      key: "from",
      header: "From",
      render: (r) => r.userEmail ?? r.userName ?? "Anonymous",
    },
    { key: "when", header: "When", render: (r) => relativeTime(r.createdAt) },
  ];

  return (
    <AdminLayout>
      <div className="aa-admin-page-heading">
        <p className="aa-settings-eyebrow">Admin workspace</p>
        <h1 className="aa-settings-h">Overview</h1>
        <p className="aa-admin-note">A quiet read on product health. Funnel details live in Funnel.</p>
      </div>
      <div className="aa-admin-filter-row" aria-label="Overview range">
        {RANGE_OPTIONS.map((option) => (
          <button key={option.value} type="button" className={`aa-admin-filter${range === option.value ? " active" : ""}`} aria-pressed={range === option.value} onClick={() => setParams({ range: option.value })}>{option.label}</button>
        ))}
      </div>
      {stats?.users && (
        <p className="aa-admin-note">
          Last refreshed {new Date(dataUpdatedAt).toLocaleString()}
        </p>
      )}

      <div className="aa-admin-group">
        <h3 className="aa-admin-group__title">Users</h3>
        <div className="aa-admin-tiles">
          <Tile value={num(u?.total)} label="Total signups" to="/app/admin/users?sort=signup_desc" />
          <Tile value={num(u?.selectedSignups)} label={`New signups · ${range}`} to={`/app/admin/users${range === "all" ? "?sort=signup_desc" : `?joined=${range}&sort=signup_desc`}`} />
          <Tile value={num(u?.selectedActive)} label={`Active users · ${range}`} to={`/app/admin/users${range === "all" ? "?sort=last_active_desc" : `?active=${range}&sort=last_active_desc`}`} />
        </div>
      </div>

      <div className="aa-admin-group">
        <h3 className="aa-admin-group__title">Active users by device</h3>
        <p className="aa-admin-note">Unique signed-in app opens. A person using more than one device appears in each matching row.</p>
        <div className="aa-admin-tiles">
          <Tile value={num(u?.deviceActivity.sevenDays.mobile)} label="Mobile users · 7 days" sub={`${num(u?.deviceActivity.thirtyDays.mobile) ?? "—"} in 30 days`} icon={<PhoneIcon />} emphasized />
          <Tile value={num(u?.deviceActivity.sevenDays.tablet)} label="Tablet users · 7 days" sub={`${num(u?.deviceActivity.thirtyDays.tablet) ?? "—"} in 30 days`} icon={<TabletIcon />} emphasized />
          <Tile value={num(u?.deviceActivity.sevenDays.desktop)} label="Desktop users · 7 days" sub={`${num(u?.deviceActivity.thirtyDays.desktop) ?? "—"} in 30 days`} icon={<DesktopIcon />} emphasized />
        </div>
        {(u?.deviceActivity.sevenDays.unknown || u?.deviceActivity.thirtyDays.unknown) ? <p className="aa-admin-note">Unclassified: {u.deviceActivity.sevenDays.unknown} in 7 days · {u.deviceActivity.thirtyDays.unknown} in 30 days.</p> : null}
      </div>

      <div className="aa-admin-group">
        <h3 className="aa-admin-group__title">Operating snapshot</h3>
        <div className="aa-admin-tiles">
          <Tile value={num(stats?.payments.confirmed)} label="Confirmed payments" />
          <Tile value={num(stats?.payments.checkoutToPaidPct)} label="Checkout → paid" sub={stats?.payments.checkoutToPaidPct === null ? "No checkout starts yet" : "% of checkout starts"} />
          <Tile value={num(stats?.activity.tasksCompleted)} label="Tasks completed" />
          <Tile value={num(stats?.activity.taskCompletionPct)} label="Task completion" sub={stats?.activity.taskCompletionPct === null ? "No tasks created yet" : "% of tasks created"} />
        </div>
      </div>

      <div className="aa-admin-group">
        <div className="aa-admin-section-head"><h3 className="aa-admin-group__title">Product activity</h3><Link to={`/app/admin/funnel?range=${range}`}>View funnel →</Link></div>
        <div className="aa-admin-tiles">
          <Tile value={num(stats?.activity.captures)} label="Captures" />
          <Tile value={num(stats?.activity.triageCompleted)} label="Triage completed" />
        </div>
        <div className="aa-admin-pulse" aria-label="Funnel pulse">
          {(stats?.funnel ?? []).map((step) => <span key={step.name}><strong>{step.count.toLocaleString()}</strong> {FUNNEL_LABELS[step.name] ?? step.name}</span>)}
        </div>
      </div>

      <div className="aa-admin-group">
        <h3 className="aa-admin-group__title">Feedback</h3>
        <div className="aa-admin-feedback-statuses">
          <Chip variant="default" small>open: {f?.byStatus.OPEN ?? "—"}</Chip>
          <Chip variant="amber" small>in progress: {f?.byStatus.IN_PROGRESS ?? "—"}</Chip>
          <Chip variant="teal" small>resolved: {f?.byStatus.RESOLVED ?? "—"}</Chip>
          <Chip variant="muted" small>closed: {f?.byStatus.CLOSED ?? "—"}</Chip>
        </div>
      </div>

      <section className="aa-settings-section">
        <div className="aa-settings-section-head">
          <h3 className="aa-settings-sh">Recent feedback</h3>
          <p className="aa-settings-note">Newest first. Show more loads the next batch.</p>
        </div>
        <Table
          columns={feedbackColumns}
          rows={items}
          rowKey={(r) => r.id}
          emptyMessage="No feedback yet."
        />
        {hasNext && (
          <Button
            variant="secondary"
            className="aa-admin-showmore"
            disabled={moreLoading}
            onClick={() => setFetchAfterId(items[items.length - 1]?.id ?? null)}
          >
            {moreLoading ? "Loading…" : "Show more"}
          </Button>
        )}
      </section>
    </AdminLayout>
  );
}
