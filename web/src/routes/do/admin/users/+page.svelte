<!--
  Users — the admin directory, ported from webapp/src/admin/AdminUsersPage.tsx
  (S17): search/filter/sort (URL is the state store), per-user 7d/30d
  activity, manual grants + removal, and single/bulk delete with the confirm
  dialogs. Filter changes reset the cursor + the page selection.
-->
<script lang="ts">
  import { page as pageStore } from "$app/state";
  import { goto } from "$app/navigation";
  import ConfirmDialog from "../../../../lib/components/ui/ConfirmDialog.svelte";
  import Table from "../../../../lib/components/admin/Table.svelte";
  import type { TableColumn } from "../../../../lib/components/admin/table.js";
  import {
    admin,
    errorMessage,
    type AdminUserRow,
    type BulkDeleteResult,
    type ManualGrant,
  } from "../../../../lib/stores/admin.svelte";

  type Pending =
    | { kind: ManualGrant | "REMOVE" | "DELETE" | "BULK_DELETE"; row?: AdminUserRow }
    | null;

  const value = (key: string) => pageStore.url.searchParams.get(key) ?? "";

  let rows = $state<AdminUserRow[]>([]);
  let total = $state(0);
  let nextCursor = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pending = $state<Pending>(null);
  let isSubmitting = $state(false);
  let selectedIds = $state<string[]>([]);

  const me = $derived(admin.user);

  // URL is the state store — every filter lives in the query string, so a
  // shared link restores the exact view (s17-admin/README.md §4).
  const query = $derived({
    search: value("q") || undefined,
    joined: (value("joined") || undefined) as "7d" | "30d" | undefined,
    active: (value("active") || undefined) as "7d" | "30d" | "inactive_30d" | "never" | undefined,
    access: (value("access") || undefined) as "free" | "pro" | "founder" | "friend" | "admin" | undefined,
    sort: (value("sort") || "signup_desc") as
      | "signup_desc"
      | "signup_asc"
      | "last_login_desc"
      | "last_active_desc",
    cursor: value("cursor") || undefined,
  });

  let loadedKey = $state<string | null>(null);
  $effect(() => {
    const key = pageStore.url.searchParams.toString();
    if (loadedKey === key) return;
    loadedKey = key;
    loading = true;
    admin
      .users(query)
      .then((result) => {
        rows = result.items;
        total = result.total;
        nextCursor = result.nextCursor;
      })
      .catch((err) => (error = errorMessage(err, "Could not load the users directory.")))
      .finally(() => (loading = false));
  });

  function update(key: string, next: string) {
    const p = new URLSearchParams(pageStore.url.searchParams);
    if (next) p.set(key, next);
    else p.delete(key);
    p.delete("cursor");
    selectedIds = [];
    void goto(`/do/admin/users?${p.toString()}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  async function act() {
    const action = pending;
    if (!action) return;
    error = null;
    isSubmitting = true;
    try {
      if (action.kind === "DELETE") {
        if (action.row) await admin.deleteUser(action.row.id);
      } else if (action.kind === "BULK_DELETE") {
        const result: BulkDeleteResult = await admin.deleteUsers(selectedIds);
        selectedIds = [];
        if (result.skipped.length) {
          error = `${result.deletedIds.length} deleted. ${result.skipped.length} skipped: ${result.skipped
            .map((item) => item.reason)
            .filter((reason, index, reasons) => reasons.indexOf(reason) === index)
            .join(" ")}`;
        }
      } else if (action.kind === "REMOVE") {
        if (action.row) await admin.removeAccess(action.row.id);
      } else if (action.row) {
        // The remaining kinds are exactly the ManualGrants.
        await admin.grantAccess(action.row.id, action.kind);
      }
      // Refetch the current view (invalidate-and-refetch, webapp parity).
      loadedKey = null;
      pending = null;
    } catch (e) {
      error = errorMessage(e, "Could not update this account.");
    } finally {
      isSubmitting = false;
    }
  }

  const visibleDeletableIds = $derived(
    rows.filter((row) => !row.isAdmin && row.id !== me?.id).map((row) => row.id),
  );

  function toggle(id: string) {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((selected) => selected !== id)
      : [...selectedIds, id];
  }

  function date(row: AdminUserRow, key: "signedUpAt" | "lastLoginAt" | "lastActiveAt") {
    const v = row[key];
    if (!v) return "Not recorded";
    return new Date(v).toLocaleString();
  }

  function relative(v: string | null) {
    if (!v) return "";
    const h = Math.floor((Date.now() - new Date(v).getTime()) / 3_600_000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function access(row: AdminUserRow) {
    const effective = row.manualAccessGrant
      ? `${row.manualAccessGrant === "FOUNDER" ? "Founder" : row.manualAccessGrant[0] + row.manualAccessGrant.slice(1).toLowerCase()} · Admin grant`
      : row.billedPlan === "FOUNDER"
        ? "Founder"
        : row.billedPlan === "PRO"
          ? "Pro"
          : "Free";
    return row.isAdmin ? `${effective} · Admin` : effective;
  }

  const columns: TableColumn[] = [
    { key: "select", header: "Select" },
    { key: "user", header: "User" },
    { key: "access", header: "Access" },
    { key: "signup", header: "Signed up" },
    { key: "login", header: "Last login" },
    { key: "active", header: "Last active" },
    { key: "activity", header: "7d activity" },
    { key: "done", header: "Tasks finished" },
    { key: "actions", header: "Actions" },
  ];

  function confirmTitle(p: NonNullable<Pending>): string {
    if (p.kind === "BULK_DELETE") return "Delete selected users";
    if (p.kind === "DELETE") return "Delete user data";
    if (p.kind === "REMOVE") return "Remove manual grant";
    return `Grant ${p.kind[0] + p.kind.slice(1).toLowerCase()}`;
  }
</script>

<div class="aa-admin-page-heading">
  <p class="aa-settings-eyebrow">Admin workspace</p>
  <h1 class="aa-settings-h">Users</h1>
  <p class="aa-admin-note">Account access and product activity. App opens are best-effort telemetry.</p>
</div>

<div class="aa-admin-users__filters">
  <input
    aria-label="Search users"
    value={value("q")}
    oninput={(e) => update("q", e.currentTarget.value)}
    placeholder="Search name or email"
  />
  <select aria-label="Joined" value={value("joined")} onchange={(e) => update("joined", e.currentTarget.value)}>
    <option value="">Any signup</option>
    <option value="7d">Joined 7d</option>
    <option value="30d">Joined 30d</option>
  </select>
  <select aria-label="Active" value={value("active")} onchange={(e) => update("active", e.currentTarget.value)}>
    <option value="">Any activity</option>
    <option value="7d">Active 7d</option>
    <option value="30d">Active 30d</option>
    <option value="inactive_30d">Inactive 30d</option>
    <option value="never">Never active</option>
  </select>
  <select aria-label="Access" value={value("access")} onchange={(e) => update("access", e.currentTarget.value)}>
    <option value="">All access</option>
    <option value="free">Free</option>
    <option value="pro">Pro</option>
    <option value="founder">Founder</option>
    <option value="friend">Friend</option>
    <option value="admin">Admin</option>
  </select>
  <select aria-label="Sort" value={query.sort} onchange={(e) => update("sort", e.currentTarget.value)}>
    <option value="signup_desc">Newest signup</option>
    <option value="signup_asc">Oldest signup</option>
    <option value="last_login_desc">Recently logged in</option>
    <option value="last_active_desc">Recently active</option>
  </select>
  {#if visibleDeletableIds.length > 0}
    <button type="button" class="aa-admin-filter" onclick={() => (selectedIds = visibleDeletableIds)}>
      Select visible users
    </button>
  {/if}
</div>

{#if selectedIds.length > 0}
  <div class="aa-admin-users__bulk">
    <span>{selectedIds.length} selected on this page</span>
    <button type="button" class="aa-admin-filter" onclick={() => (pending = { kind: "BULK_DELETE" })}>
      Delete selected
    </button>
    <button type="button" class="aa-admin-filter" onclick={() => (selectedIds = [])}>Clear</button>
  </div>
{/if}

{#if error}
  <div class="aa-admin-error"><p>{error}</p></div>
{/if}

<Table
  {columns}
  rows={rows}
  rowKey={(r) => r.id}
  emptyMessage={loading ? "Loading users…" : "No users match this view."}
>
  {#snippet cell(col: TableColumn, r: AdminUserRow)}
    {#if col.key === "select"}
      {#if !r.isAdmin && r.id !== me?.id}
        <input
          aria-label={`Select ${r.email ?? r.name ?? "user"}`}
          type="checkbox"
          checked={selectedIds.includes(r.id)}
          onchange={() => toggle(r.id)}
        />
      {/if}
    {:else if col.key === "user"}
      <strong>{r.name}</strong><small>{r.email ?? "No email identity"}</small>
    {:else if col.key === "access"}
      {access(r)}
    {:else if col.key === "signup"}
      <span title={r.signedUpAt}>{date(r, "signedUpAt")}<small>{relative(r.signedUpAt)}</small></span>
    {:else if col.key === "login"}
      {#if r.lastLoginAt}
        <span title={r.lastLoginAt}>{date(r, "lastLoginAt")}<small>{relative(r.lastLoginAt)}</small></span>
      {:else}
        <span class="aa-admin-users__missing">Not recorded</span>
      {/if}
    {:else if col.key === "active"}
      {#if r.lastActiveAt}
        <span title={r.lastActiveAt}>{date(r, "lastActiveAt")}<small>{relative(r.lastActiveAt)}</small></span>
      {:else}
        <span class="aa-admin-users__missing">Not recorded</span>
      {/if}
    {:else if col.key === "activity"}
      <span>{r.logins7d} logins · {r.appOpens7d} opens<br /><small>{r.tasksCreated7d} tasks · {r.projectsCreated7d} projects · {r.goalsCreated7d} goals</small></span>
    {:else if col.key === "done"}
      {r.tasksFinished7d} / {r.tasksFinished30d}
    {:else if col.key === "actions"}
      {#if r.isAdmin}
        Protected
      {:else}
        <span class="aa-admin-users__actions">
          <button type="button" onclick={() => (pending = { row: r, kind: "PRO" })}>Grant Pro</button>
          <button type="button" onclick={() => (pending = { row: r, kind: "FRIEND" })}>Grant Friend</button>
          <button type="button" onclick={() => (pending = { row: r, kind: "FOUNDER" })}>Grant Founder</button>
          {#if r.manualAccessGrant}
            <button type="button" onclick={() => (pending = { row: r, kind: "REMOVE" })}>Remove grant</button>
          {/if}
          <button type="button" class="danger" onclick={() => (pending = { row: r, kind: "DELETE" })}>Delete</button>
        </span>
      {/if}
    {/if}
  {/snippet}
</Table>

{#if total > rows.length && nextCursor}
  <button type="button" class="aa-admin-showmore aa-admin-filter" onclick={() => update("cursor", nextCursor!)}>
    Next page
  </button>
{/if}

{#if pending}
  <ConfirmDialog
    title={confirmTitle(pending)}
    confirmLabel={pending.kind === "BULK_DELETE" ? "Delete users" : pending.kind === "DELETE" ? "Delete data" : "Confirm"}
    danger={pending.kind === "DELETE" || pending.kind === "BULK_DELETE"}
    confirmDisabled={isSubmitting}
    onConfirm={act}
    onClose={() => (pending = null)}
  >
    {#snippet message()}
      {#if pending?.kind === "BULK_DELETE"}
        <p>Permanently delete {selectedIds.length} selected local accounts? Accounts with active recurring billing remain protected and will be skipped. Payments stay for reconciliation.</p>
      {:else if pending?.kind === "DELETE"}
        <p>Permanently delete {pending.row?.email ?? "this account"} and its local data? Accounts with active recurring billing remain protected. Payments stay for reconciliation.</p>
      {:else}
        <p>This changes effective product access without changing Stripe billing.</p>
      {/if}
    {/snippet}
  </ConfirmDialog>
{/if}
