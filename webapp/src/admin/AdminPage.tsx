import { useEffect, useState } from "react";
import { useAuth } from "wasp/client/auth";
import { useQuery, useAction, getAdminStats, getRecentFeedback, updateFeedbackStatus } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { SettingsLayout } from "../app/SettingsLayout";
import { Button, Card, Chip, Table, type TableColumn } from "../components/ui";
import type { FeedbackRow } from "./operationsCore";
import type { FeedbackStatus } from "../feedback/operationsCore";
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

  const { data: stats, isLoading: statsLoading, error: statsError, dataUpdatedAt } = useQuery(getAdminStats);
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
    t && t.created7d > 0
      ? Math.round((t.completed7d / t.created7d) * 100)
      : null;

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

  const feedbackColumns: TableColumn<FeedbackRow>[] = [
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusSelect
          status={r.status}
          onStatusChange={(s) => handleStatusChange(r.id, s)}
        />
      ),
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
          Last refreshed {new Date(dataUpdatedAt).toLocaleString()}
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
            onClick={() => setFetchAfterId(items[items.length - 1]?.id ?? null)}
          >
            {moreLoading ? "Loading…" : "Show more"}
          </Button>
        )}
      </section>
    </SettingsLayout>
  );
}
