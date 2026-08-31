import { useAuth } from "wasp/client/auth";
import { getAdminActivityStats, useQuery } from "wasp/client/operations";
import { AdminLayout } from "./AdminLayout";
import { Card, Table, type TableColumn } from "../components/ui";
import type { ActivityWeek } from "./operationsCore";
import "./AdminPage.css";
import "./AdminActivityPage.css";

/** Display a [start, exclusiveEnd) bucket as "Aug 31 – Sep 6" (UTC dates). */
function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const start = new Date(weekStart);
  const endInclusive = new Date(new Date(weekEnd).getTime() - 1);
  return `${fmt.format(start)} – ${fmt.format(endInclusive)}`;
}

/** Calm week-over-week delta: "+12%", "-40%", "new" (no baseline), or "—". */
function delta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "new" : "—";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

type ActivityTileProps = {
  value: number | null;
  label: string;
  current: ActivityWeek | undefined;
  previous: ActivityWeek | undefined;
  field: "signups" | "activeUsers" | "captures" | "tasksCompleted";
};

function ActivityTile({ value, label, current, previous, field }: ActivityTileProps) {
  const sub =
    current && previous
      ? `last week ${previous[field].toLocaleString()} · ${delta(current[field], previous[field])}`
      : undefined;
  return (
    <Card padding="md" className="aa-admin-tile">
      <span className={`aa-admin-tile__num ${value === null ? "aa-admin-tile__num--placeholder" : ""}`}>
        {value === null ? "—" : value.toLocaleString()}
      </span>
      <span className="aa-admin-tile__label">{label}</span>
      {sub && <span className="aa-admin-tile__sub">{sub}</span>}
    </Card>
  );
}

type ActivityRow = {
  rowKey: string;
  weekLabel: string;
  signups: number;
  activeUsers: number;
  captures: number;
  triageCompleted: number;
  tasksCreated: number;
  tasksCompleted: number;
  isTotal?: boolean;
};

const ACTIVITY_COLUMNS: TableColumn<ActivityRow>[] = [
  { key: "week", header: "Week", render: (r) => <span className={r.isTotal ? "aa-admin-activity-total" : undefined}>{r.weekLabel}</span> },
  { key: "signups", header: "Signups", align: "right" },
  { key: "activeUsers", header: "Active", align: "right" },
  { key: "captures", header: "Captures", align: "right" },
  { key: "triageCompleted", header: "Triage", align: "right" },
  { key: "tasksCreated", header: "Tasks made", align: "right" },
  { key: "tasksCompleted", header: "Tasks done", align: "right" },
];

function toRow(week: ActivityWeek): ActivityRow {
  return {
    rowKey: week.weekStart,
    weekLabel: `${formatWeekRange(week.weekStart, week.weekEnd)}${week.isCurrent ? " · in progress" : ""}`,
    signups: week.signups,
    activeUsers: week.activeUsers,
    captures: week.captures,
    triageCompleted: week.triageCompleted,
    tasksCreated: week.tasksCreated,
    tasksCompleted: week.tasksCompleted,
  };
}

function totalsRow(label: string, weeks: ActivityWeek[]): ActivityRow {
  const sum = (pick: (w: ActivityWeek) => number) => weeks.reduce((acc, w) => acc + pick(w), 0);
  return {
    rowKey: `${label}-total`,
    weekLabel: `${label} total`,
    signups: sum((w) => w.signups),
    activeUsers: sum((w) => w.activeUsers),
    captures: sum((w) => w.captures),
    triageCompleted: sum((w) => w.triageCompleted),
    tasksCreated: sum((w) => w.tasksCreated),
    tasksCompleted: sum((w) => w.tasksCompleted),
    isTotal: true,
  };
}

export function AdminActivityPage() {
  const { data: user } = useAuth();
  const { data, isLoading, error } = useQuery(getAdminActivityStats);

  if (!user?.isAdmin) {
    return (
      <AdminLayout>
        <Card padding="lg">
          <p>You don't have access to this page.</p>
        </Card>
      </AdminLayout>
    );
  }

  const weeks = data?.weeks ?? [];
  const currentWeek = weeks[weeks.length - 1];
  const previousWeek = weeks[weeks.length - 2];
  const num = (n: number | undefined) => (isLoading || n === undefined ? null : n);

  const monthRows = data ? [...data.month.weeks.map(toRow), totalsRow(data.month.label, data.month.weeks)] : [];
  const trendRows = weeks.map(toRow);

  return (
    <AdminLayout>
      <div className="aa-admin-page-heading">
        <p className="aa-settings-eyebrow">Admin workspace</p>
        <h1 className="aa-settings-h">Activity</h1>
        <p className="aa-admin-note">
          Calendar weeks, Monday–Sunday · UTC. Month rows are clipped to the month's edges, so their totals are the month's own. Captures and triage are best-effort browser telemetry.
        </p>
      </div>

      {error && (
        <Card padding="md" className="aa-admin-error">
          <p>{error.message}</p>
        </Card>
      )}

      <div className="aa-admin-group">
        <div className="aa-admin-section-head">
          <h3 className="aa-admin-group__title">This week</h3>
          {currentWeek && <span>{formatWeekRange(currentWeek.weekStart, currentWeek.weekEnd)}</span>}
        </div>
        <div className="aa-admin-tiles">
          <ActivityTile value={num(currentWeek?.signups)} label="Signups" current={currentWeek} previous={previousWeek} field="signups" />
          <ActivityTile value={num(currentWeek?.activeUsers)} label="Active users" current={currentWeek} previous={previousWeek} field="activeUsers" />
          <ActivityTile value={num(currentWeek?.captures)} label="Captures" current={currentWeek} previous={previousWeek} field="captures" />
          <ActivityTile value={num(currentWeek?.tasksCompleted)} label="Tasks completed" current={currentWeek} previous={previousWeek} field="tasksCompleted" />
        </div>
      </div>

      <div className="aa-admin-group">
        <div className="aa-admin-section-head">
          <h3 className="aa-admin-group__title">Current month, week by week</h3>
          {data && <span>{data.month.label}</span>}
        </div>
        <Table
          columns={ACTIVITY_COLUMNS}
          rows={monthRows}
          rowKey={(r) => r.rowKey}
          emptyMessage={isLoading ? "Loading weeks…" : "No activity yet."}
        />
      </div>

      <div className="aa-admin-group">
        <div className="aa-admin-section-head">
          <h3 className="aa-admin-group__title">Last 8 weeks</h3>
          <span>Oldest → newest</span>
        </div>
        <Table
          columns={ACTIVITY_COLUMNS}
          rows={trendRows}
          rowKey={(r) => r.rowKey}
          emptyMessage={isLoading ? "Loading weeks…" : "No activity yet."}
        />
      </div>
    </AdminLayout>
  );
}
