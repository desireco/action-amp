<!--
  Overview — the admin stats dashboard, ported from webapp/src/admin/
  AdminPage.tsx (S17): stats tiles (users / device / operating / product
  activity) + the funnel pulse + the recent-feedback table with inline
  triage and "Show more" paging. URL is the state store for the range.
-->
<script lang="ts">
  import { page as pageStore } from "$app/state";
  import { goto } from "$app/navigation";
  import Chip from "../../../../lib/components/Chip.svelte";
  import Table from "../../../../lib/components/admin/Table.svelte";
  import type { TableColumn } from "../../../../lib/components/admin/table.js";
  import StatusSelect from "../../../../lib/components/admin/StatusSelect.svelte";
  import {
    admin,
    errorMessage,
    type AdminStats,
    type FeedbackRow,
    type FunnelRange,
    type FeedbackStatus,
  } from "../../../../lib/stores/admin.svelte";

  // URL is the state store: ?range=7d|30d|all (invalid → 30d, webapp parity).
  const range = $derived(
    pageStore.url.searchParams.get("range") === "7d" ||
      pageStore.url.searchParams.get("range") === "all"
      ? (pageStore.url.searchParams.get("range") as FunnelRange)
      : ("30d" as FunnelRange),
  );

  const RANGE_OPTIONS: Array<{ label: string; value: FunnelRange }> = [
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "All time", value: "all" },
  ];

  const FUNNEL_LABELS = new Map<string, string>([
    ["LANDING_VIEW", "Landing"], ["SIGNUP_COMPLETED", "Signup"], ["APP_OPENED", "App open"],
    ["CAPTURE_CREATED", "Capture"], ["TRIAGE_COMPLETED", "Triage"], ["CHECKOUT_STARTED", "Checkout"],
    ["PAYMENT_CONFIRMED", "Paid"],
  ]);

  let stats = $state<AdminStats | null>(null);
  let statsLoading = $state(true);
  let statsError = $state<string | null>(null);

  // Recent feedback: the first page always loads; appended pages accumulate
  // so repeated "Show more" clicks don't drop intermediate pages.
  let firstPageItems = $state<FeedbackRow[]>([]);
  let firstPageHasNext = $state(false);
  let appended = $state<FeedbackRow[]>([]);
  let appendedHasNext = $state<boolean | null>(null);
  let moreLoading = $state(false);
  let listLoading = $state(true);

  async function load(rangeValue: FunnelRange) {
    statsLoading = true;
    statsError = null;
    try {
      stats = await admin.stats(rangeValue);
    } catch (err) {
      stats = null;
      statsError = errorMessage(err, "Could not load the admin stats.");
    } finally {
      statsLoading = false;
    }
  }

  async function loadFirstPage() {
    listLoading = true;
    try {
      const result = await admin.recentFeedback({ afterId: null, limit: 10 });
      firstPageItems = result.items;
      firstPageHasNext = result.hasNext;
      appended = [];
      appendedHasNext = null;
    } catch {
      firstPageItems = [];
      firstPageHasNext = false;
    } finally {
      listLoading = false;
    }
  }

  let loadedRange: FunnelRange | null = $state(null);
  $effect(() => {
    if (loadedRange !== range) {
      loadedRange = range;
      void load(range);
    }
  });

  let firstPageLoaded = $state(false);
  $effect(() => {
    if (!firstPageLoaded) {
      firstPageLoaded = true;
      void loadFirstPage();
    }
  });

  const items = $derived([...firstPageItems, ...appended]);
  const hasNext = $derived(appendedHasNext ?? firstPageHasNext);

  async function showMore() {
    const afterId = items.at(-1)?.id ?? null;
    if (!afterId) return;
    moreLoading = true;
    try {
      const fetched = await admin.recentFeedback({ afterId, limit: 10 });
      appended = [...appended, ...fetched.items];
      appendedHasNext = fetched.hasNext;
    } finally {
      moreLoading = false;
    }
  }

  // Inline triage: fire the action, then refetch both the list and the stats
  // (by-status counts). Invalidate-and-refetch, not optimistic (webapp).
  async function handleStatusChange(id: string, status: FeedbackStatus) {
    try {
      await admin.updateFeedbackStatus(id, status);
      await Promise.all([loadFirstPage(), load(range)]);
    } catch (err) {
      console.error("[admin] status update failed:", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await admin.deleteFeedback(id);
      await Promise.all([loadFirstPage(), load(range)]);
    } catch (err) {
      console.error("[admin] delete failed:", err);
    }
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  }

  function setRange(value: FunnelRange) {
    void goto(`/do/admin/overview?range=${value}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  const columns: TableColumn[] = [
    { key: "status", header: "Status" },
    { key: "message", header: "Message" },
    { key: "route", header: "Route" },
    { key: "from", header: "From" },
    { key: "when", header: "When" },
  ];

</script>


<div class="aa-admin-page-heading">
  <p class="aa-settings-eyebrow">Admin workspace</p>
  <h1 class="aa-settings-h">Overview</h1>
  <p class="aa-admin-note">A quiet read on product health. Funnel details live in Funnel.</p>
</div>

<div class="aa-admin-filter-row" aria-label="Overview range">
  {#each RANGE_OPTIONS as option (option.value)}
    <button
      type="button"
      class="aa-admin-filter {range === option.value ? "active" : ""}"
      aria-pressed={range === option.value}
      onclick={() => setRange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

{#if statsError}
  <div class="aa-admin-error"><p>{statsError}</p></div>
{/if}

{#if stats}
  {@const u = stats.users}
  {@const f = stats.feedback}

  <p class="aa-admin-note">Last refreshed {new Date().toLocaleString()}</p>

  <div class="aa-admin-group">
    <div class="aa-admin-section-head">
      <h3 class="aa-admin-group__title">Users</h3>
      <a href="/do/admin/activity">Weekly signups → Activity</a>
    </div>
    <div class="aa-admin-tiles">
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : u.total.toLocaleString()}</span>
        <a class="aa-admin-tile__label" href="/do/admin/users?sort=signup_desc">Total signups</a>
      </div>
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : u.selectedSignups.toLocaleString()}</span>
        <a class="aa-admin-tile__label" href={`/do/admin/users${range === "all" ? "?sort=signup_desc" : `?joined=${range}&sort=signup_desc`}`}>New signups · {range}</a>
      </div>
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : u.selectedActive.toLocaleString()}</span>
        <a class="aa-admin-tile__label" href={`/do/admin/users${range === "all" ? "?sort=last_active_desc" : `?active=${range}&sort=last_active_desc`}`}>Active users · {range}</a>
      </div>
    </div>
  </div>

  <div class="aa-admin-group">
    <h3 class="aa-admin-group__title">Active users by device</h3>
    <p class="aa-admin-note">Unique signed-in app opens. A person using more than one device appears in each matching row.</p>
    <div class="aa-admin-tiles">
      <div class="aa-admin-tile">
        <div class="aa-admin-tile__metric">
          <span class="aa-admin-tile__num aa-admin-tile__num--emphasized {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : u.deviceActivity.sevenDays.mobile.toLocaleString()}</span>
        </div>
        <span class="aa-admin-tile__label">Mobile users · 7 days</span>
        <span class="aa-admin-tile__sub">{u.deviceActivity.thirtyDays.mobile.toLocaleString()} in 30 days</span>
      </div>
      <div class="aa-admin-tile">
        <div class="aa-admin-tile__metric">
          <span class="aa-admin-tile__num aa-admin-tile__num--emphasized {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : u.deviceActivity.sevenDays.tablet.toLocaleString()}</span>
        </div>
        <span class="aa-admin-tile__label">Tablet users · 7 days</span>
        <span class="aa-admin-tile__sub">{u.deviceActivity.thirtyDays.tablet.toLocaleString()} in 30 days</span>
      </div>
      <div class="aa-admin-tile">
        <div class="aa-admin-tile__metric">
          <span class="aa-admin-tile__num aa-admin-tile__num--emphasized {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : u.deviceActivity.sevenDays.desktop.toLocaleString()}</span>
        </div>
        <span class="aa-admin-tile__label">Desktop users · 7 days</span>
        <span class="aa-admin-tile__sub">{u.deviceActivity.thirtyDays.desktop.toLocaleString()} in 30 days</span>
      </div>
    </div>
    {#if u.deviceActivity.sevenDays.unknown || u.deviceActivity.thirtyDays.unknown}
      <p class="aa-admin-note">Unclassified: {u.deviceActivity.sevenDays.unknown} in 7 days · {u.deviceActivity.thirtyDays.unknown} in 30 days.</p>
    {/if}
  </div>

  <div class="aa-admin-group">
    <h3 class="aa-admin-group__title">Operating snapshot</h3>
    <div class="aa-admin-tiles">
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : stats.payments.confirmed.toLocaleString()}</span>
        <span class="aa-admin-tile__label">Confirmed payments</span>
      </div>
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : (stats.payments.checkoutToPaidPct?.toLocaleString() ?? "—")}</span>
        <span class="aa-admin-tile__label">Checkout → paid</span>
        <span class="aa-admin-tile__sub">{stats.payments.checkoutToPaidPct === null ? "No checkout starts yet" : "% of checkout starts"}</span>
      </div>
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : stats.activity.tasksCompleted.toLocaleString()}</span>
        <span class="aa-admin-tile__label">Tasks completed</span>
      </div>
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : (stats.activity.taskCompletionPct?.toLocaleString() ?? "—")}</span>
        <span class="aa-admin-tile__label">Task completion</span>
        <span class="aa-admin-tile__sub">{stats.activity.taskCompletionPct === null ? "No tasks created yet" : "% of tasks created"}</span>
      </div>
    </div>
  </div>

  <div class="aa-admin-group">
    <div class="aa-admin-section-head">
      <h3 class="aa-admin-group__title">Product activity</h3>
      <a href={`/do/admin/funnel?range=${range}`}>View funnel →</a>
    </div>
    <div class="aa-admin-tiles">
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : stats.activity.captures.toLocaleString()}</span>
        <span class="aa-admin-tile__label">Captures</span>
      </div>
      <div class="aa-admin-tile">
        <span class="aa-admin-tile__num {statsLoading ? "aa-admin-tile__num--placeholder" : ""}">{statsLoading ? "—" : stats.activity.triageCompleted.toLocaleString()}</span>
        <span class="aa-admin-tile__label">Triage completed</span>
      </div>
    </div>
    <div class="aa-admin-pulse" aria-label="Funnel pulse">
      {#each stats.funnel as step (step.name)}
        <span><strong>{step.count.toLocaleString()}</strong> {FUNNEL_LABELS.get(step.name) ?? step.name}</span>
      {/each}
    </div>
  </div>

  <div class="aa-admin-group">
    <h3 class="aa-admin-group__title">Feedback</h3>
    <div class="aa-admin-feedback-statuses">
      <Chip variant="default" small>open: {f.byStatus.OPEN}</Chip>
      <Chip variant="amber" small>in progress: {f.byStatus.IN_PROGRESS}</Chip>
      <Chip variant="teal" small>resolved: {f.byStatus.RESOLVED}</Chip>
      <Chip variant="muted" small>closed: {f.byStatus.CLOSED}</Chip>
    </div>
  </div>
{/if}

<section class="aa-admin-group">
  <div class="aa-admin-section-head">
    <h3 class="aa-admin-group__title">Recent feedback</h3>
    <p class="aa-admin-note">Newest first. Show more loads the next batch.</p>
  </div>
  <Table
    {columns}
    rows={items}
    rowKey={(r) => r.id}
    emptyMessage={listLoading ? "Loading feedback…" : "No feedback yet."}
  >
    {#snippet cell(col: TableColumn, row: FeedbackRow)}
      {#if col.key === "status"}
        <StatusSelect
          status={row.status}
          onStatusChange={(s) => handleStatusChange(row.id, s)}
          onDelete={() => handleDelete(row.id)}
        />
      {:else if col.key === "route"}
        {#if !row.route && !row.lensName}
          —
        {:else}
          <span
            class="aa-admin-feedback-route"
            title={[
              row.lensName ? `lens: ${row.lensName}` : null,
              row.section ? `section: ${row.section}` : null,
              row.route ? `route: ${row.route}` : null,
            ]
              .filter(Boolean)
              .join("\n")}
          >
            {#if row.lensName}
              <span class="aa-admin-feedback-route__lens">
                {#if row.lensColor}
                  <span class="aa-admin-feedback-route__lens-dot" style="background: {row.lensColor}" aria-hidden="true"></span>
                {/if}
                {row.lensName}
              </span>
            {/if}
            {#if row.route}
              <span class="aa-admin-feedback-route__path">{row.route}</span>
            {/if}
          </span>
        {/if}
      {:else if col.key === "from"}
        {row.userEmail ?? row.userName ?? "Anonymous"}
      {:else if col.key === "when"}
        {relativeTime(row.createdAt)}
      {:else}
        {row.message.split("\n")[0].slice(0, 80)}
      {/if}
    {/snippet}
  </Table>
  {#if hasNext}
    <button
      type="button"
      class="aa-admin-showmore aa-admin-filter"
      disabled={moreLoading}
      onclick={() => void showMore()}
    >
      {moreLoading ? "Loading…" : "Show more"}
    </button>
  {/if}
</section>
