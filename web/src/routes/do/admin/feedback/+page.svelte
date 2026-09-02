<!--
  Feedback — the admin triage table, ported from webapp/src/admin/
  AdminFeedbackPage.tsx (S17): status select + soft delete per row, an
  open/in-progress filter (URL state), and cursor-paged "Show more".
-->
<script lang="ts">
  import { page as pageStore } from "$app/state";
  import { goto } from "$app/navigation";
  import Table from "../../../../lib/components/admin/Table.svelte";
  import type { TableColumn } from "../../../../lib/components/admin/table.js";
  import StatusSelect from "../../../../lib/components/admin/StatusSelect.svelte";
  import {
    admin,
    type FeedbackRow,
    type FeedbackStatus,
  } from "../../../../lib/stores/admin.svelte";

  const FILTERS: Array<{ label: string; value: "open" | "all" }> = [
    { label: "Open + in progress", value: "open" },
    { label: "All statuses", value: "all" },
  ];

  const filter = $derived(
    pageStore.url.searchParams.get("status") === "all" ? "all" : "open",
  );
  const statuses = $derived<FeedbackStatus[] | undefined>(
    filter === "all" ? undefined : ["OPEN", "IN_PROGRESS"],
  );

  function setFilter(value: "open" | "all") {
    void goto(
      `/do/admin/feedback?${value === "open" ? "status=open,in_progress" : "status=all"}`,
      { keepFocus: true, noScroll: true },
    );
  }

  let items = $state<FeedbackRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let moreLoading = $state(false);
  let firstHasNext = $state(false);
  let moreHasNext = $state<boolean | null>(null);

  async function loadFirst() {
    loading = true;
    error = null;
    try {
      const page = await admin.recentFeedback({
        afterId: null,
        limit: 25,
        statuses,
      });
      items = page.items;
      firstHasNext = page.hasNext;
      moreHasNext = null;
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not load feedback.";
      items = [];
      firstHasNext = false;
    } finally {
      loading = false;
    }
  }

  // Reload when the filter flips (webapp's [data, filter] effect).
  let loadedFilter: "open" | "all" | null = $state(null);
  $effect(() => {
    if (loadedFilter !== filter) {
      loadedFilter = filter;
      void loadFirst();
    }
  });

  async function showMore() {
    const afterId = items.at(-1)?.id ?? null;
    if (!afterId) return;
    moreLoading = true;
    try {
      const page = await admin.recentFeedback({
        afterId,
        limit: 25,
        statuses,
      });
      items = [...items, ...page.items];
      moreHasNext = page.hasNext;
    } finally {
      moreLoading = false;
    }
  }

  async function updateStatus(id: string, status: FeedbackStatus) {
    await admin.updateFeedbackStatus(id, status);
    // The open view drops resolved/closed rows instead of re-styling them.
    items =
      filter === "open" && (status === "RESOLVED" || status === "CLOSED")
        ? items.filter((item) => item.id !== id)
        : items.map((item) => (item.id === id ? { ...item, status } : item));
  }

  async function remove(id: string) {
    await admin.deleteFeedback(id);
    items = items.filter((item) => item.id !== id);
  }

  function relativeTime(iso: string) {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const columns: TableColumn[] = [
    { key: "status", header: "Status" },
    { key: "message", header: "Message" },
    { key: "from", header: "From" },
    { key: "route", header: "Route" },
    { key: "when", header: "When" },
  ];

  const canShowMore = $derived((firstHasNext && !moreLoading) || moreHasNext === true);
</script>

<div class="aa-admin-page-heading">
  <p class="aa-settings-eyebrow">Admin workspace</p>
  <h1 class="aa-settings-h">Feedback</h1>
  <p class="aa-admin-note">Work through what people are telling you. Newest first.</p>
</div>

<div class="aa-admin-filter-row" aria-label="Feedback status filter">
  {#each FILTERS as option (option.value)}
    <button
      type="button"
      class="aa-admin-filter {filter === option.value ? "active" : ""}"
      aria-pressed={filter === option.value}
      onclick={() => setFilter(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

{#if error}
  <div class="aa-admin-error"><p>{error}</p></div>
{/if}

<Table
  {columns}
  rows={items}
  rowKey={(row) => row.id}
  emptyMessage={loading ? "Loading feedback…" : "No feedback in this view."}
>
  {#snippet cell(col: TableColumn, row: FeedbackRow)}
    {#if col.key === "status"}
      <StatusSelect
        status={row.status}
        onStatusChange={(next) => updateStatus(row.id, next)}
        onDelete={() => remove(row.id)}
      />
    {:else if col.key === "message"}
      {row.message.split("\n")[0].slice(0, 100)}
    {:else if col.key === "from"}
      {row.userEmail ?? row.userName ?? "Anonymous"}
    {:else if col.key === "route"}
      {row.route ?? "—"}
    {:else if col.key === "when"}
      {relativeTime(row.createdAt)}
    {/if}
  {/snippet}
</Table>

{#if canShowMore}
  <button
    type="button"
    class="aa-admin-showmore aa-admin-filter"
    disabled={moreLoading}
    onclick={() => void showMore()}
  >
    {moreLoading ? "Loading…" : "Show more"}
  </button>
{/if}
