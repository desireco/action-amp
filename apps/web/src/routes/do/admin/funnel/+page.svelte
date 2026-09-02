<!--
  Funnel — growth funnel + acquisition + retention, ported from webapp/src/
  admin/AdminFunnelPage.tsx (S17). URL is the state store for the range.
-->
<script lang="ts">
  import { page as pageStore } from "$app/state";
  import { goto } from "$app/navigation";
  import Table from "../../../../lib/components/admin/Table.svelte";
  import type { TableColumn } from "../../../../lib/components/admin/table.js";
  import {
    admin,
    errorMessage,
    type FunnelRange,
    type FunnelStats,
  } from "../../../../lib/stores/admin.svelte";

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

  const LABELS = new Map<string, string>([
    ["LANDING_VIEW", "Landing"],
    ["SIGNUP_COMPLETED", "Signup"],
    ["APP_OPENED", "App open"],
    ["CAPTURE_CREATED", "First capture"],
    ["TRIAGE_COMPLETED", "First triage"],
    ["CHECKOUT_STARTED", "Checkout"],
    ["PAYMENT_CONFIRMED", "Paid"],
  ]);

  const LABELS_ORDER = [
    "LANDING_VIEW",
    "SIGNUP_COMPLETED",
    "APP_OPENED",
    "CAPTURE_CREATED",
    "TRIAGE_COMPLETED",
    "CHECKOUT_STARTED",
    "PAYMENT_CONFIRMED",
  ];

  const sourceColumns: TableColumn[] = [
    { key: "source", header: "Source" },
    { key: "sessions", header: "Sessions", align: "right" },
    { key: "signups", header: "Signups", align: "right" },
    { key: "checkouts", header: "Checkouts", align: "right" },
    { key: "payments", header: "Paid", align: "right" },
    { key: "conversionPct", header: "Visitor → paid", align: "right" },
  ];

  interface SourceRow {
    source: string;
    sessions: number;
    signups: number;
    checkouts: number;
    payments: number;
    conversionPct: number | null;
  }

  let data = $state<FunnelStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let loadedRange: FunnelRange | null = $state(null);
  $effect(() => {
    if (loadedRange === range) return;
    loadedRange = range;
    loading = true;
    error = null;
    admin
      .funnel(range)
      .then((result) => (data = result))
      .catch((err) => (error = errorMessage(err, "Could not load the funnel.")))
      .finally(() => (loading = false));
  });

  function setRange(value: FunnelRange) {
    void goto(`/do/admin/funnel?range=${value}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  const funnelSteps = $derived(
    data?.funnel ??
      LABELS_ORDER.map((name) => ({
        name,
        count: 0,
        fromPreviousPct: null,
        fromLandingPct: null,
      })),
  );
</script>

<div class="aa-admin-page-heading">
  <p class="aa-settings-eyebrow">Admin workspace</p>
  <h1 class="aa-settings-h">Funnel</h1>
  <p class="aa-admin-note">Where people move from first look to first payment.</p>
</div>

<div class="aa-admin-filter-row" aria-label="Funnel range">
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

{#if error}
  <div class="aa-admin-error"><p>{error}</p></div>
{/if}

<section class="aa-admin-funnel-section" aria-labelledby="funnel-path-heading">
  <div class="aa-admin-section-head">
    <h2 id="funnel-path-heading">Primary path</h2>
    <span>{data?.range ?? range}</span>
  </div>
  <div class="aa-admin-funnel-path">
    {#each funnelSteps as step (step.name)}
      <div class="aa-admin-funnel-step">
        <span class="aa-admin-funnel-step__count">{loading ? "—" : step.count.toLocaleString()}</span>
        <span class="aa-admin-funnel-step__label">{LABELS.get(step.name) ?? step.name}</span>
        <span class="aa-admin-funnel-step__rate">{step.fromPreviousPct === null ? "Start" : `${step.fromPreviousPct}% from prior`}</span>
      </div>
    {/each}
  </div>
</section>

<section class="aa-admin-funnel-section">
  <div class="aa-admin-section-head">
    <h2>Acquisition</h2>
    <span>Grouped by source and campaign</span>
  </div>
  <Table
    columns={sourceColumns}
    rows={(data?.sources ?? []) as unknown as SourceRow[]}
    rowKey={(r) => r.source}
    emptyMessage={loading ? "Loading acquisition…" : "No acquisition events in this range."}
  >
    {#snippet cell(col: TableColumn, row: SourceRow)}
      {#if col.key === "conversionPct"}
        {row.conversionPct === null ? "—" : `${row.conversionPct}%`}
      {:else}
        {String((row as unknown as Record<string, unknown>)[col.key] ?? "")}
      {/if}
    {/snippet}
  </Table>
</section>

<section class="aa-admin-funnel-section">
  <div class="aa-admin-section-head">
    <h2>Retention</h2>
    <span>D1 / D7 return rate</span>
  </div>
  <div class="aa-admin-retention-card">
    <div>
      <strong>{data?.retention.d1Pct == null ? "—" : `${data.retention.d1Pct}%`}</strong>
      <span>D1 return</span>
    </div>
    <div>
      <strong>{data?.retention.d7Pct == null ? "—" : `${data.retention.d7Pct}%`}</strong>
      <span>D7 return</span>
    </div>
    {#if data?.retention.note}
      <p>{data.retention.note}</p>
    {/if}
  </div>
</section>

<p class="aa-admin-method-note">Anonymous acquisition context comes from StatCounter. Account-linked activation and payment events come from ActionAmp's first-party event ledger.</p>
