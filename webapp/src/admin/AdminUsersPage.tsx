import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { useAction, useQuery } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { deleteAdminUser, getAdminUsers, grantAdminUserAccess, removeAdminUserAccess } from "wasp/client/operations";
import { AdminLayout } from "./AdminLayout";
import { Button, Card, ConfirmDialog, Table, type TableColumn } from "../components/ui";
import type { ManualGrant } from "./userManagementCore";
import "./AdminUsersPage.css";

type Row = Awaited<ReturnType<typeof getAdminUsers>>["items"][number];
const value = (params: URLSearchParams, key: string) => params.get(key) ?? "";
const date = (v: Date | string | null) => v ? <span title={new Date(v).toISOString()}>{new Date(v).toLocaleString()}<small>{relative(v)}</small></span> : <span className="aa-admin-users__missing">Not recorded</span>;
function relative(v: Date | string) { const h = Math.floor((Date.now() - new Date(v).getTime()) / 3_600_000); return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; }
function access(row: Row) { if (row.isAdmin) return "Admin"; return row.manualAccessGrant ? `${row.manualAccessGrant === "FOUNDER" ? "Founder" : row.manualAccessGrant[0] + row.manualAccessGrant.slice(1).toLowerCase()} · Admin grant` : row.billedPlan === "FOUNDER" ? "Founder" : row.billedPlan === "PRO" ? "Pro" : "Free"; }

export function AdminUsersPage() {
  const { data: user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState<{ row: Row; kind: ManualGrant | "REMOVE" | "DELETE" } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const args = { search: value(params, "q") || undefined, joined: value(params, "joined") || undefined, active: value(params, "active") || undefined, access: value(params, "access") || undefined, sort: value(params, "sort") || "signup_desc", cursor: value(params, "cursor") || undefined, limit: 25 } as any;
  const { data, isLoading } = useQuery(getAdminUsers, args);
  const grant = useAction(grantAdminUserAccess), remove = useAction(removeAdminUserAccess), destroy = useAction(deleteAdminUser);
  const queryClient = useQueryClient();
  const update = (key: string, next: string) => { const p = new URLSearchParams(params); next ? p.set(key, next) : p.delete(key); p.delete("cursor"); setParams(p); };
  const act = async () => {
    if (!pending) return; setError(null); setIsSubmitting(true);
    try {
      if (pending.kind === "DELETE") await destroy({ targetUserId: pending.row.id, confirmedEmail: email });
      else if (pending.kind === "REMOVE") await remove({ targetUserId: pending.row.id });
      else await grant({ targetUserId: pending.row.id, grant: pending.kind });
      await queryClient.invalidateQueries({ queryKey: ["getAdminUsers"] });
      await queryClient.invalidateQueries({ queryKey: ["getAdminStats"] });
      setPending(null); setEmail("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update this account."); } finally { setIsSubmitting(false); }
  };
  const columns = useMemo<TableColumn<Row>[]>(() => [
    { key: "user", header: "User", render: (r) => <><strong>{r.name}</strong><small>{r.email ?? "No email identity"}</small></> },
    { key: "access", header: "Access", render: access },
    { key: "signup", header: "Signed up", render: (r) => date(r.signedUpAt) },
    { key: "login", header: "Last login", render: (r) => date(r.lastLoginAt) },
    { key: "active", header: "Last active", render: (r) => date(r.lastActiveAt) },
    { key: "activity", header: "7d activity", render: (r) => <span>{r.logins7d} logins · {r.appOpens7d} opens<br /><small>{r.tasksCreated7d} tasks · {r.projectsCreated7d} projects · {r.goalsCreated7d} goals</small></span> },
    { key: "done", header: "Tasks finished", render: (r) => `${r.tasksFinished7d} / ${r.tasksFinished30d}` },
    { key: "actions", header: "Actions", render: (r) => r.isAdmin ? "Protected" : <span className="aa-admin-users__actions"><button onClick={() => setPending({ row: r, kind: "PRO" })}>Grant Pro</button><button onClick={() => setPending({ row: r, kind: "FRIEND" })}>Grant Friend</button><button onClick={() => setPending({ row: r, kind: "FOUNDER" })}>Grant Founder</button>{r.manualAccessGrant && <button onClick={() => setPending({ row: r, kind: "REMOVE" })}>Remove grant</button>}<button className="danger" onClick={() => setPending({ row: r, kind: "DELETE" })}>Delete</button></span> },
  ], []);
  if (!user?.isAdmin) return <AdminLayout><Card padding="lg"><p>You don't have access to this page.</p></Card></AdminLayout>;
  return <AdminLayout><div className="aa-admin-page-heading"><p className="aa-settings-eyebrow">Admin workspace</p><h1 className="aa-settings-h">Users</h1><p className="aa-admin-note">Account access and product activity. App opens are best-effort telemetry.</p></div>
    <div className="aa-admin-users__filters"><input aria-label="Search users" value={value(params, "q")} onChange={(e) => update("q", e.target.value)} placeholder="Search name or email" /><select aria-label="Access" value={value(params, "access")} onChange={(e) => update("access", e.target.value)}><option value="">All access</option><option value="free">Free</option><option value="pro">Pro</option><option value="founder">Founder</option><option value="friend">Friend</option><option value="admin">Admin</option></select><select aria-label="Sort" value={args.sort} onChange={(e) => update("sort", e.target.value)}><option value="signup_desc">Newest signup</option><option value="signup_asc">Oldest signup</option><option value="last_login_desc">Recently logged in</option><option value="last_active_desc">Recently active</option></select></div>
    {error && <Card padding="md" className="aa-admin-error"><p>{error}</p></Card>}<Table columns={columns} rows={data?.items ?? []} rowKey={(r) => r.id} emptyMessage={isLoading ? "Loading users…" : "No users match this view."} />
    {data?.nextCursor && <Button variant="secondary" onClick={() => update("cursor", data.nextCursor!)}>Next page</Button>}
    {pending && <ConfirmDialog title={pending.kind === "DELETE" ? "Delete user data" : pending.kind === "REMOVE" ? "Remove manual grant" : `Grant ${pending.kind[0] + pending.kind.slice(1).toLowerCase()}`} message={<>{pending.kind === "DELETE" ? <label>Type {pending.row.email} to permanently remove local account data. Payments remain for reconciliation.<input value={email} onChange={(e) => setEmail(e.target.value)} /></label> : <p>This changes effective product access without changing Stripe billing.</p>}</>} confirmLabel={pending.kind === "DELETE" ? "Delete data" : "Confirm"} danger={pending.kind === "DELETE"} confirmDisabled={(pending.kind === "DELETE" && email.trim().toLowerCase() !== pending.row.email?.toLowerCase()) || isSubmitting} onConfirm={act} onClose={() => { setPending(null); setEmail(""); }} />}
  </AdminLayout>;
}
