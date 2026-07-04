import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getProjects, createProject, triageInboxItem, getAppData } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Chip, GroupedList, ProGate, type GroupDef } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "../lists/ListShell";
import { CreateInline } from "../lists/CreateInline";
import { FREE_LIMITS } from "../billing/config";
import { useEntitled, extractEntitlementMessage } from "../billing/useEntitled";
import type { EntitlementMessage } from "../billing/entitlement-types";
import "./ProjectsPage.css";
import "../lists/CreateInline.css";

interface ProjectRow {
  id: string;
  name: string;
  dueDate: Date | string | null;
  goal: { id: string; name: string } | null;
  openCount: number;
  doneCount: number;
  nextAction: { id: string; description: string; priority: string; size: string } | null;
}

/**
 * Projects — grouped by Goal (or "Standalone"). Each row shows progress
 * (X/Y done), due date, and a next-action preview (or a "no next action" badge).
 */
export function ProjectsPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gate, setGate] = useState<EntitlementMessage | null>(null);

  // Entitlement: FREE users capped at FREE_LIMITS.projects per lens. The count
  // comes from getAppData (lens-scoped, non-done) — already fetched by the shell
  // with the same lensName key, so React Query dedupes (no new round-trip). PRO
  // users see no cap UI.
  const entitled = useEntitled();
  const { data: appData } = useQuery(
    getAppData,
    { lensId: lens?.id ?? null },
    { enabled: !!lens },
  );
  const projectCount = appData?.counts.projects ?? 0;
  const atCap = !entitled && projectCount >= FREE_LIMITS.projects;

  // Shift+P from triage arrives here with state { fromInboxItemId, initialName }:
  // open the create form pre-filled, and on submit convert the inbox item into a
  // Project (triageInboxItem deletes the item + creates the project atomically).
  // ponytail: capture the inbox id in a ref — the nav state is cleared on mount
  // (so a refresh doesn't re-trigger), but handleCreate must still see it.
  const location = useLocation();
  const triageState = location.state as { fromInboxItemId?: string; initialName?: string } | null;
  const fromInboxRef = useRef<string | null>(triageState?.fromInboxItemId ?? null);
  const [initialName, setInitialName] = useState(triageState?.initialName ?? "");
  useEffect(() => {
    if (triageState?.fromInboxItemId) setCreating(true);
  }, [triageState]);
  // Clear the nav state so a refresh / re-entry doesn't re-trigger the form.
  useEffect(() => {
    if (triageState) navigate(location.pathname, { replace: true, state: null });
    // eslint not configured for exhaustive-deps; [] = run once on mount.
  }, []);
  const { data: projects, isLoading } = useQuery(
    getProjects,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );

  const handleCreate = async (name: string) => {
    if (!lens) return;
    setSubmitting(true);
    setGate(null);
    try {
      if (fromInboxRef.current) {
        // Came from triage (Shift+P): convert the inbox item into this project.
        await triageInboxItem({
          inboxItemId: fromInboxRef.current,
          decision: "project",
          lensId: lens.id,
          name,
        });
        fromInboxRef.current = null;
      } else {
        await createProject({ name, lensId: lens.id });
      }
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
      setCreating(false);
      setInitialName("");
    } catch (err) {
      // Entitlement: a 402 from the cap guard becomes a paywall moment, not a
      // raw error. The server attaches { feature, reason }; surface the panel.
      setGate(extractEntitlementMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const groups = useMemo<GroupDef<ProjectRow>[]>(() => {
    if (!projects) return [];
    const byGoal = new Map<string, ProjectRow[]>();
    for (const p of projects) {
      const key = p.goal?.name ?? "Standalone";
      if (!byGoal.has(key)) byGoal.set(key, []);
      byGoal.get(key)!.push(p);
    }
    return Array.from(byGoal, ([name, items]) => ({ key: name, label: name, items }));
  }, [projects]);

  // The create affordance: a normal button, OR — for a FREE user at the cap —
  // a ProGate trigger so the cap is a quiet upgrade path, not a dead button.
  const CreateControl = ({ empty }: { empty: boolean }) =>
    atCap ? (
      <ProGate
        asTrigger
        feature="New project"
        reason="organize more than 3 projects with Pro"
      >
        <span className="aa-progate-trigger__label">New project</span>
        <span className="aa-progate-trigger__cta">Upgrade →</span>
      </ProGate>
    ) : (
      <Button variant="secondary" size="sm" onClick={() => (empty ? setCreating(true) : setCreating((v) => !v))}>
        {creating ? "Cancel" : "New project"}
      </Button>
    );

  // Allowance chip for FREE users (PRO sees no cap UI). Only when not at cap —
  // at the cap the trigger itself signals it.
  const AllowanceChip = () =>
    !entitled && !atCap ? (
      <Chip variant="muted" small>
        {projectCount} of {FREE_LIMITS.projects} used
      </Chip>
    ) : null;

  if (!isLoading && (projects?.length ?? 0) === 0) {
    return (
      <div className="aa-projects">
        <header className="aa-list-header">
          <div>
            <div className="aa-list-header__eyebrow">Projects</div>
            <h1 className="aa-list-header__title">0 active</h1>
          </div>
          <CreateControl empty />
        </header>
        {gate && (
          <ProGate feature={gate.feature} reason={gate.reason} />
        )}
        {creating && (
          <CreateInline
            placeholder="Project name (e.g. ‘Ship product v2’)"
            onCreate={handleCreate}
            onCancel={() => setCreating(false)}
            submitting={submitting}
            initialValue={initialName}
          />
        )}
        <ListEmpty
          title="No projects yet."
          text="Projects are outcomes that need more than one step. Create one here, or promote a big task during triage."
        />
      </div>
    );
  }

  return (
    <div className="aa-projects">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Projects</div>
          <h1 className="aa-list-header__title">{projects?.length ?? 0} active</h1>
          <div className="aa-list-header__meta">
            <AllowanceChip />
          </div>
        </div>
        <CreateControl empty={false} />
      </header>
      {gate && (
        <ProGate feature={gate.feature} reason={gate.reason} />
      )}
      {creating && (
        <CreateInline
          placeholder="Project name (e.g. ‘Ship product v2’)"
          onCreate={handleCreate}
          onCancel={() => setCreating(false)}
          submitting={submitting}
          initialValue={initialName}
        />
      )}
      <GroupedList
        groups={groups}
        renderItem={(p) => {
          const total = p.openCount + p.doneCount;
          const pct = total === 0 ? 0 : Math.round((p.doneCount / total) * 100);
          return (
            <button
              type="button"
              className="aa-project-row"
              onClick={() => navigate(`/app/projects/${p.id}`)}
            >
              <div className="aa-project-row__head">
                <span className="aa-project-row__name">{p.name}</span>
                {p.dueDate && <Chip variant="teal" small>{formatDue(p.dueDate)}</Chip>}
              </div>
              <div className="aa-project-row__progress">
                <div className="aa-project-row__bar">
                  <div className="aa-project-row__fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="aa-project-row__count">
                  {p.doneCount}/{total} done
                </span>
              </div>
              <div className="aa-project-row__next">
                {p.nextAction ? (
                  <span className="aa-project-row__next-action">→ {p.nextAction.description}</span>
                ) : (
                  <Chip variant="muted" small>No next action</Chip>
                )}
              </div>
            </button>
          );
        }}
      />
    </div>
  );
}

function formatDue(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
