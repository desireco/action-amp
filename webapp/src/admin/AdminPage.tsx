import { useState } from "react";
import { useAuth } from "wasp/client/auth";
import { useQuery, getAdminStats, getRecentFeedback } from "wasp/client/operations";
import { SettingsLayout } from "../app/SettingsLayout";
import { Button, Card, Chip, Table, type TableColumn } from "../components/ui";
import type { FeedbackRow } from "./operationsCore";
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

function statusVariant(status: FeedbackRow["status"]): "default" | "amber" | "teal" | "muted" {
  switch (status) {
    case "OPEN": return "default";
    case "IN_PROGRESS": return "amber";
    case "RESOLVED": return "teal";
    case "CLOSED": return "muted";
  }
}

function Tile({ value, label, sub }: { value: number | null; label: string; sub?: string }) {
  const loading = value === null;
  return (
    <Card padding="md" className="aa-admin-tile">
      <span className={`aa-admin-tile__num ${loading ? "aa-admin-tile__num--placeholder" : ""}`}>
        {loading ? "—" : value!.toLocaleString()}
      </span>
      <span className="aa-admin-tile__label">{label}</span>
      {sub && <span className="aa-admin-tile__sub">{sub}</span>}
    </Card>
  );
}

export function AdminPage() {
  const { data: user } = useAuth();

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery(getAdminStats);
  const [afterId, setAfterId] = useState<string | null>(null);
  const { data: firstPage } = useQuery(getRecentFeedback, { afterId: null, limit: 10 });
  const { data: nextPage, isLoading: moreLoading } = useQuery(
    getRecentFeedback,
    { afterId, limit: 10 },
    { enabled: !!afterId },
  );

  if (!user?.isAdmin) {
    return (
      <SettingsLayout>
        <Card padding="lg">
          <p>You don't have access to this page.</p>
        </Card>
      </SettingsLayout>
    );
  }

  if (statsError) {
    return (
      <SettingsLayout>
        <Card padding="lg" className="aa-admin-error">
          <p>{statsError.message}</p>
        </Card>
      </SettingsLayout>
    );
  }

  const u = stats?.users;
  const t = stats?.tasks;
  const f = stats?.feedback;
  const num = (n: number | undefined) => (statsLoading || n === undefined ? null : n);
  const completionPct =
    u !== undefined && t && t.created7d > 0
      ? Math.round((t.completed7d / t.created7d) * 100)
      : null;

  // Accumulate feedback items across pages.
  const items: FeedbackRow[] = [
    ...(firstPage?.items ?? []),
    ...(afterId ? (nextPage?.items ?? []) : []),
  ];
  const hasNext = (afterId ? nextPage?.hasNext : firstPage?.hasNext) ?? false;

  const feedbackColumns: TableColumn<FeedbackRow>[] = [
    {
      key: "status",
      header: "Status",
      render: (r) => <Chip variant={statusVariant(r.status)} small>{r.status.toLowerCase().replace("_", " ")}</Chip>,
    },
    { key: "message", header: "Message", render: (r) => r.message.split("\n")[0].slice(0, 80) },
    {
      key: "from",
      header: "From",
      render: (r) => r.userEmail ?? r.userName ?? "Anonymous",
    },
    { key: "when", header: "When", render: (r) => relativeTime(r.createdAt) },
  ];

  return (
    <SettingsLayout>
      <h2 className="aa-settings-sh">Admin</h2>
      {stats?.users && (
        <p className="aa-admin-note">
          Last refreshed {new Date().toLocaleString()}
        </p>
      )}

      <div className="aa-admin-group">
        <h3 className="aa-admin-group__title">Users</h3>
        <div className="aa-admin-tiles">
          <Tile value={num(u?.total)} label="Total signups" />
          <Tile value={num(u?.signedUpToday)} label="Today" />
          <Tile value={num(u?.signedUp7d)} label="Last 7 days" />
          <Tile value={num(u?.signedUp30d)} label="Last 30 days" />
        </div>
      </div>

      <div className="aa-admin-group">
        <h3 className="aa-admin-group__title">Active users</h3>
        <div className="aa-admin-tiles">
          <Tile value={num(u?.activeToday)} label="Today" />
          <Tile value={num(u?.active7d)} label="Last 7 days" />
          <Tile value={num(u?.active30d)} label="Last 30 days" />
        </div>
      </div>

      <div className="aa-admin-group">
        <h3 className="aa-admin-group__title">Tasks (last 7 days)</h3>
        <div className="aa-admin-tiles">
          <Tile value={num(t?.created7d)} label="Created" />
          <Tile value={num(t?.completed7d)} label="Completed" sub={completionPct !== null ? `${completionPct}% of created` : undefined} />
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
            onClick={() => setAfterId(items[items.length - 1]?.id ?? null)}
          >
            {moreLoading ? "Loading…" : "Show more"}
          </Button>
        )}
      </section>
    </SettingsLayout>
  );
}
