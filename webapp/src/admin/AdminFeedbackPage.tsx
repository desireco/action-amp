import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { getRecentFeedback, updateFeedbackStatus, deleteFeedback } from "wasp/client/operations";
import { useQuery, useAction } from "wasp/client/operations";
import { AdminLayout } from "./AdminLayout";
import { StatusSelect } from "./StatusSelect";
import { Button, Card, Table, type TableColumn } from "../components/ui";
import type { FeedbackRow } from "./operationsCore";
import type { FeedbackStatus } from "../feedback/operationsCore";
import "./AdminPage.css";

const FILTERS: Array<{ label: string; value: "open" | "all" }> = [
  { label: "Open + in progress", value: "open" },
  { label: "All statuses", value: "all" },
];

function relativeTime(iso: string | Date) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AdminFeedbackPage() {
  const { data: user } = useAuth();
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") === "all" ? "all" : "open";
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  const statuses = filter === "all" ? undefined : ["OPEN", "IN_PROGRESS"] as FeedbackStatus[];
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery(getRecentFeedback, { afterId: null, limit: 25, statuses });
  const more = useQuery(getRecentFeedback, cursor ? { afterId: cursor, limit: 25, statuses } : undefined, { enabled: !!cursor });
  const updateStatusAction = useAction(updateFeedbackStatus);
  const deleteAction = useAction(deleteFeedback);

  useEffect(() => {
    setItems(data?.items ?? []);
    setCursor(null);
  }, [data, filter]);

  useEffect(() => {
    if (!cursor || !more.data) return;
    setItems((prev) => [...prev, ...more.data!.items]);
    setCursor(null);
  }, [cursor, more.data]);

  const updateStatus = async (id: string, status: FeedbackStatus) => {
    await updateStatusAction({ id, status });
    setItems((prev) => filter === "open" && (status === "RESOLVED" || status === "CLOSED")
      ? prev.filter((item) => item.id !== id)
      : prev.map((item) => item.id === id ? { ...item, status } : item));
  };

  const remove = async (id: string) => {
    await deleteAction({ id });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const columns = useMemo<TableColumn<FeedbackRow>[]>(() => [
    { key: "status", header: "Status", render: (row) => <StatusSelect status={row.status} onStatusChange={(next) => updateStatus(row.id, next)} onDelete={() => remove(row.id)} /> },
    { key: "message", header: "Message", render: (row) => row.message.split("\n")[0].slice(0, 100) },
    { key: "from", header: "From", render: (row) => row.userEmail ?? row.userName ?? "Anonymous" },
    { key: "route", header: "Route", render: (row) => row.route ?? "—" },
    { key: "when", header: "When", render: (row) => relativeTime(row.createdAt) },
  ], [filter]);

  if (!user?.isAdmin) return <AdminLayout><Card padding="lg"><p>You don't have access to this page.</p></Card></AdminLayout>;

  return (
    <AdminLayout>
      <div className="aa-admin-page-heading">
        <p className="aa-settings-eyebrow">Admin workspace</p>
        <h1 className="aa-settings-h">Feedback</h1>
        <p className="aa-admin-note">Work through what people are telling you. Newest first.</p>
      </div>
      <div className="aa-admin-filter-row" aria-label="Feedback status filter">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`aa-admin-filter${filter === option.value ? " active" : ""}`}
            aria-pressed={filter === option.value}
            onClick={() => setParams(option.value === "open" ? { status: "open,in_progress" } : { status: "all" })}
          >{option.label}</button>
        ))}
      </div>
      {error && <Card padding="md" className="aa-admin-error"><p>{error.message}</p></Card>}
      <Table columns={columns} rows={items} rowKey={(row) => row.id} emptyMessage={isLoading ? "Loading feedback…" : "No feedback in this view."} />
      {((data?.hasNext && !cursor) || more.data?.hasNext) && (
        <Button variant="secondary" className="aa-admin-showmore" disabled={more.isLoading} onClick={() => setCursor(items.at(-1)?.id ?? null)}>
          {more.isLoading ? "Loading…" : "Show more"}
        </Button>
      )}
    </AdminLayout>
  );
}
