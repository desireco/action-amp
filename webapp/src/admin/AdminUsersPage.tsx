import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { useAction, useQuery } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { deleteAdminUser, deleteAdminUsers, getAdminUsers, grantAdminUserAccess, removeAdminUserAccess } from "wasp/client/operations";
import { AdminLayout } from "./AdminLayout";
import { Button, Card, ConfirmDialog, Table, type TableColumn } from "../components/ui";
import type { ManualGrant } from "./userManagementCore";
import "./AdminUsersPage.css";

type Row = Awaited<ReturnType<typeof getAdminUsers>>["items"][number];
const value = (params: URLSearchParams, key: string) => params.get(key) ?? "";
const date = (v: Date | string | null) => v ? <span title={new Date(v).toISOString()}>{new Date(v).toLocaleString()}<small>{relative(v)}</small></span> : <span className="aa-admin-users__missing">Not recorded</span>;
function relative(v: Date | string) { const h = Math.floor((Date.now() - new Date(v).getTime()) / 3_600_000); return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; }
function access(row: Row) { const effective = row.manualAccessGrant ? `${row.manualAccessGrant === "FOUNDER" ? "Founder" : row.manualAccessGrant[0] + row.manualAccessGrant.slice(1).toLowerCase()} · Admin grant` : row.billedPlan === "FOUNDER" ? "Founder" : row.billedPlan === "PRO" ? "Pro" : "Free"; return row.isAdmin ? `${effective} · Admin` : effective; }

export function AdminUsersPage() {
  const { data: user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState<{ row?: Row; kind: ManualGrant | "REMOVE" | "DELETE" | "BULK_DELETE" } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // SAFETY: double/wide assertion needed — runtime shape is verified.
  const args = { search: value(params, "q") || undefined, joined: value(params, "joined") || undefined, active: value(params, "active") || undefined, access: value(params, "access") || undefined, sort: value(params, "sort") || "signup_desc", cursor: value(params, "cursor") || undefined, limit: 25 } as any;
  const { data, isLoading } = useQuery(getAdminUsers, args);
  const grant = useAction(grantAdminUserAccess), remove = useAction(removeAdminUserAccess), destroy = useAction(deleteAdminUser), destroyMany = useAction(deleteAdminUsers);
  const queryClient = useQueryClient();
  const update = (key: string, next: string) => { const p = new URLSearchParams(params); next ? p.set(key, next) : p.delete(key); p.delete("cursor"); setSelectedIds([]); setParams(p); };
  const act = async () => {
    if (!pending) return; setError(null); setIsSubmitting(true);
    try {
      if (pending.kind === "DELETE" && pending.row) await destroy({ targetUserId: pending.row.id });
      else if (pending.kind === "BULK_DELETE") {
        // SAFETY: type assertion is safe — value is validated or from a trusted source.
        const result = await destroyMany({ targetUserIds: selectedIds }) as { deletedIds: string[]; skipped: Array<{ targetUserId: string; reason: string }> };
        setSelectedIds([]);
        if (result.skipped.length) setError(`${result.deletedIds.length} deleted. ${result.skipped.length} skipped: ${result.skipped.map((item) => item.reason).filter((reason, index, reasons) => reasons.indexOf(reason) === index).join(" ")}`);
      } else if (pending.kind === "REMOVE" && pending.row) await remove({ targetUserId: pending.row.id });
      else if (pending.row) {
        // SAFETY: pending.kind is guaranteed to be a valid ManualGrant from the UI picker.
        await grant({ targetUserId: pending.row.id, grant: pending.kind as ManualGrant });
      }
      await queryClient.invalidateQueries({ queryKey: ["getAdminUsers"] });
      await queryClient.invalidateQueries({ queryKey: ["getAdminStats"] });
      setPending(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update this account."); } finally { setIsSubmitting(false); }
  };
  const visibleDeletableIds = (data?.items ?? []).filter((row) => !row.isAdmin && row.id !== user?.id).map((row) => row.id);
  const toggle = (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((selected) => selected !== id) : [...ids, id]);
  const columns = useMemo<TableColumn<Row>[]>(() => [
    { key: "select", header: "Select", render: (r) => !r.isAdmin && r.id !== user?.id ? <input aria-label={`Select ${r.email ?? r.name ?? "user"}`} type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggle(r.id)} /> : null },
    { key: "user", header: "User", render: (r) => <><strong>{r.name}</strong><small>{r.email ?? "No email identity"}</small></> },
    { key: "access", header: "Access", render: access },
    { key: "signup", header: "Signed up", render: (r) => date(r.signedUpAt) },
    { key: "login", header: "Last login", render: (r) => date(r.lastLoginAt) },
    { key: "active", header: "Last active", render: (r) => date(r.lastActiveAt) },
    { key: "activity", header: "7d activity", render: (r) => <span>{r.logins7d} logins · {r.appOpens7d} opens<br /><small>{r.tasksCreated7d} tasks · {r.projectsCreated7d} projects · {r.goalsCreated7d} goals</small></span> },
    { key: "done", header: "Tasks finished", render: (r) => `${r.tasksFinished7d} / ${r.tasksFinished30d}` },
    { key: "actions", header: "Actions", render: (r) => r.isAdmin ? "Protected" : <span className="aa-admin-users__actions"><button onClick={() => setPending({ row: r, kind: "PRO" })}>Grant Pro</button><button onClick={() => setPending({ row: r, kind: "FRIEND" })}>Grant Friend</button><button onClick={() => setPending({ row: r, kind: "FOUNDER" })}>Grant Founder</button>{r.manualAccessGrant && <button onClick={() => setPending({ row: r, kind: "REMOVE" })}>Remove grant</button>}<button className="danger" onClick={() => setPending({ row: r, kind: "DELETE" })}>Delete</button></span> },
  ], [selectedIds, visibleDeletableIds, user?.id]);
  if (!user?.isAdmin) return <AdminLayout><Card padding="lg"><p>You don't have access to this page.</p></Card></AdminLayout>;
  return <AdminLayout><div className="aa-admin-page-heading"><p className="aa-settings-eyebrow">Admin workspace</p><h1 className="aa-settings-h">Users</h1><p className="aa-admin-note">Account access and product activity. App opens are best-effort telemetry.</p></div>
    <div className="aa-admin-users__filters"><input aria-label="Search users" value={value(params, "q")} onChange={(e) => update("q", e.target.value)} placeholder="Search name or email" /><select aria-label="Joined" value={value(params, "joined")} onChange={(e) => update("joined", e.target.value)}><option value="">Any signup</option><option value="7d">Joined 7d</option><option value="30d">Joined 30d</option></select><select aria-label="Active" value={value(params, "active")} onChange={(e) => update("active", e.target.value)}><option value="">Any activity</option><option value="7d">Active 7d</option><option value="30d">Active 30d</option><option value="inactive_30d">Inactive 30d</option><option value="never">Never active</option></select><select aria-label="Access" value={value(params, "access")} onChange={(e) => update("access", e.target.value)}><option value="">All access</option><option value="free">Free</option><option value="pro">Pro</option><option value="founder">Founder</option><option value="friend">Friend</option><option value="admin">Admin</option></select><select aria-label="Sort" value={args.sort} onChange={(e) => update("sort", e.target.value)}><option value="signup_desc">Newest signup</option><option value="signup_asc">Oldest signup</option><option value="last_login_desc">Recently logged in</option><option value="last_active_desc">Recently active</option></select>{visibleDeletableIds.length > 0 && <Button variant="secondary" size="sm" onClick={() => setSelectedIds(visibleDeletableIds)}>Select visible users</Button>}</div>
    {selectedIds.length > 0 && <div className="aa-admin-users__bulk"><span>{selectedIds.length} selected on this page</span><Button variant="danger" size="sm" onClick={() => setPending({ kind: "BULK_DELETE" })}>Delete selected</Button><Button variant="secondary" size="sm" onClick={() => setSelectedIds([])}>Clear</Button></div>}
    {error && <Card padding="md" className="aa-admin-error"><p>{error}</p></Card>}<Table columns={columns} rows={data?.items ?? []} rowKey={(r) => r.id} emptyMessage={isLoading ? "Loading users…" : "No users match this view."} />
    {data?.nextCursor && <Button variant="secondary" onClick={() => update("cursor", data.nextCursor!)}>Next page</Button>}
    {pending && <ConfirmDialog title={pending.kind === "BULK_DELETE" ? "Delete selected users" : pending.kind === "DELETE" ? "Delete user data" : pending.kind === "REMOVE" ? "Remove manual grant" : `Grant ${pending.kind[0] + pending.kind.slice(1).toLowerCase()}`} message={pending.kind === "BULK_DELETE" ? <p>Permanently delete {selectedIds.length} selected local accounts? Accounts with active recurring billing remain protected and will be skipped. Payments stay for reconciliation.</p> : pending.kind === "DELETE" ? <p>Permanently delete {pending.row?.email ?? "this account"} and its local data? Accounts with active recurring billing remain protected. Payments stay for reconciliation.</p> : <p>This changes effective product access without changing Stripe billing.</p>} confirmLabel={pending.kind === "BULK_DELETE" ? "Delete users" : pending.kind === "DELETE" ? "Delete data" : "Confirm"} danger={pending.kind === "DELETE" || pending.kind === "BULK_DELETE"} confirmDisabled={isSubmitting} onConfirm={act} onClose={() => setPending(null)} />}
  </AdminLayout>;
}
