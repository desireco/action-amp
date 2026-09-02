<!--
  Activity — week-bucketed activity metrics, ported from webapp/src/admin/
  AdminActivityPage.tsx (S17): this-week tiles with calm week-over-week
  deltas, the current month clipped to its calendar edges, and the 8-week
  trend (oldest → newest, Monday–Sunday UTC).
-->
<script lang="ts">
  import Table from "../../../../lib/components/admin/Table.svelte";
  import type { TableColumn } from "../../../../lib/components/admin/table.js";
  import {
    admin,
    errorMessage,
    type ActivityStats,
    type ActivityWeek,
  } from "../../../../lib/stores/admin.svelte";

  let data = $state<ActivityStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let loaded = $state(false);
  $effect(() => {
    if (loaded) return;
    loaded = true;
    admin
      .activityStats()
      .then((result) => (data = result))
      .catch((err) => (error = errorMessage(err, "Could not load the activity stats.")))
      .finally(() => (loading = false));
  });

  /** Display a [start, exclusiveEnd) bucket as "Aug 31 – Sep 6" (UTC dates). */
  function formatWeekRange(weekStart: string, weekEnd: string): string {
    const fmt = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const endInclusive = new Date(new Date(weekEnd).getTime() - 1);
    return `${fmt.format(new Date(weekStart))} – ${fmt.format(endInclusive)}`;
  }

  /** Calm week-over-week delta: "+12%", "-40%", "new" (no baseline), or "—". */
  function delta(current: number, previous: number): string {
    if (previous === 0) return current > 0 ? "new" : "—";
    const pct = Math.round(((current - previous) / previous) * 100);
    return `${pct >= 0 ? "+" : ""}${pct}%`;
  }

  interface ActivityRow {
    rowKey: string;
    weekLabel: string;
    signups: number;
    activeUsers: number;
    captures: number;
    triageCompleted: number;
    tasksCreated: number;
    tasksCompleted: number;
    isTotal?: boolean;
  }

  const columns: TableColumn[] = [
    { key: "week", header: "Week" },
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
    const sum = (pick: (w: ActivityWeek) => number) =>
      weeks.reduce((acc, w) => acc + pick(w), 0);
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

  const monthRows = $derived(
    data ? [...data.month.weeks.map(toRow), totalsRow(data.month.label, data.month.weeks)] : [],
  );
  const trendRows = $derived(data ? data.weeks.map(toRow) : []);
  const currentWeek = $derived(data?.weeks.at(-1));
  const previousWeek = $derived(data ? data.weeks[data.weeks.length - 2] : undefined);
</script>

<div class="aa-admin-page-heading">
  <p class="aa-settings-eyebrow">Admin workspace</p>
  <h1 class="aa-settings-h">Activity</h1>
  <p class="aa-admin-note">
    Calendar weeks, Monday–Sunday · UTC. Month rows are clipped to the month's edges, so their totals are the month's own. Captures and triage are best-effort browser telemetry.
  </p>
</div>

{#if error}
  <div class="aa-admin-error"><p>{error}</p></div>
{/if}

<div class="aa-admin-group">
  <div class="aa-admin-section-head">
    <h3 class="aa-admin-group__title">This week</h3>
    {#if currentWeek}
      <span>{formatWeekRange(currentWeek.weekStart, currentWeek.weekEnd)}</span>
    {/if}
  </div>
  <div class="aa-admin-tiles">
    {#each [
      { label: "Signups", field: "signups" as const },
      { label: "Active users", field: "activeUsers" as const },
      { label: "Captures", field: "captures" as const },
      { label: "Tasks completed", field: "tasksCompleted" as const },
    ] as tile (tile.field)}
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {loading || !currentWeek ? "aa-admin-tile__num--placeholder" : ""}">
          {loading || !currentWeek ? "—" : currentWeek[tile.field].toLocaleString()}
        </span>
        <span class="aa-admin-tile__label">{tile.label}</span>
        {#if currentWeek && previousWeek}
          <span class="aa-admin-tile__sub">
            last week {previousWeek[tile.field].toLocaleString()} · {delta(currentWeek[tile.field], previousWeek[tile.field])}
          </span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<div class="aa-admin-group">
  <div class="aa-admin-section-head">
    <h3 class="aa-admin-group__title">Current month, week by week</h3>
    {#if data}<span>{data.month.label}</span>{/if}
  </div>
  <Table
    {columns}
    rows={monthRows}
    rowKey={(r) => r.rowKey}
    emptyMessage={loading ? "Loading weeks…" : "No activity yet."}
  >
    {#snippet cell(col: TableColumn, row: ActivityRow)}
      {#if col.key === "week"}
        <span class={row.isTotal ? "aa-admin-activity-total" : undefined}>{row.weekLabel}</span>
      {:else}
        {String((row as unknown as Record<string, unknown>)[col.key] ?? "")}
      {/if}
    {/snippet}
  </Table>
</div>

<div class="aa-admin-group">
  <div class="aa-admin-section-head">
    <h3 class="aa-admin-group__title">Last 8 weeks</h3>
    <span>Oldest → newest</span>
  </div>
  <Table
    {columns}
    rows={trendRows}
    rowKey={(r) => r.rowKey}
    emptyMessage={loading ? "Loading weeks…" : "No activity yet."}
  >
    {#snippet cell(col: TableColumn, row: ActivityRow)}
      {#if col.key === "week"}
        <span class={row.isTotal ? "aa-admin-activity-total" : undefined}>{row.weekLabel}</span>
      {:else}
        {String((row as unknown as Record<string, unknown>)[col.key] ?? "")}
      {/if}
    {/snippet}
  </Table>
</div>
