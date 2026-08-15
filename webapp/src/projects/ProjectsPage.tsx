import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getProjects, createProject, triageInboxItem, getAppData } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import {
  Chip,
  RecordCardGrid,
  RecordComposer,
  ProgressCard,
  ProjectsIcon,
  ProGate,
  RecordCreateControl,
  AllowanceChip,
} from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "../lists/ListShell";
import { FREE_LIMITS } from "../billing/config";
import { useEntitled, extractEntitlementMessage } from "../billing/useEntitled";
import type { EntitlementMessage } from "../billing/entitlement-types";
import { formatRelativeDue } from "../shared/dateFormat";
import "./ProjectsPage.css";

interface ProjectRow {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  dueDate: Date | string | null;
  isDone: boolean;
  completedAt: Date | string | null;
  goal: { id: string; name: string } | null;
  openCount: number;
  doneCount: number;
  nextAction: { id: string; description: string; priority: string; size: string } | null;
}

/**
 * Projects — grouped by Goal (or "Standalone"). Each card shows progress,
 * due date, and a focus preview.
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
    lens ? { lensId: lens.id, includeCompleted: true } : undefined,
    { enabled: !!lens },
  );
  const activeProjects = (projects ?? []).filter((project: ProjectRow) => !project.isDone);
  const completedProjects = (projects ?? []).filter((project: ProjectRow) => project.isDone);

  const handleCreate = async (name: string, description?: string) => {
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
        await createProject({ name, lensId: lens.id, description });
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

  // The composer is rendered identically in both the empty-state branch and
  // the populated branch — extract it once so the props can't drift.
  const composer = creating ? (
    <RecordComposer
      title="New project"
      subtitle="Name the outcome. Add the shape of done if it helps."
      nameLabel="Project"
      namePlaceholder="Ship product v2"
      descriptionLabel="What makes it done"
      descriptionPlaceholder="The concrete result this project should create"
      submitLabel="Create project"
      onCreate={handleCreate}
      onCancel={() => setCreating(false)}
      submitting={submitting}
      initialName={initialName}
    />
  ) : null;

  const gatePanel = gate ? (
    <ProGate feature={gate.feature} reason={gate.reason} />
  ) : null;

  if (!isLoading && (projects?.length ?? 0) === 0) {
    return (
      <div className="aa-projects">
        <header className="aa-list-header">
          <div>
            <div className="aa-list-header__eyebrow">Planning</div>
            <h1 className="aa-list-header__title">Projects</h1>
            <p className="aa-list-header__description">
              0 active · Outcomes that need more than one step.
            </p>
          </div>
          <RecordCreateControl
            label="New project"
            icon={ProjectsIcon}
            upgradeFeature="New project"
            upgradeReason="organize more of your work"
            creating={creating}
            atCap={atCap}
            empty
            onToggleCreating={setCreating}
          />
        </header>
        {gatePanel}
        {composer}
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
          <div className="aa-list-header__eyebrow">Planning</div>
          <h1 className="aa-list-header__title">Projects</h1>
          <p className="aa-list-header__description">
            {isLoading ? "Loading projects…" : `${activeProjects.length} active · Outcomes that need more than one step.`}
          </p>
          <div className="aa-list-header__meta">
            <AllowanceChip
              entitled={entitled}
              atCap={atCap}
              used={projectCount}
              cap={FREE_LIMITS.projects}
            />
          </div>
        </div>
        <RecordCreateControl
          label="New project"
          icon={ProjectsIcon}
          upgradeFeature="New project"
          upgradeReason="organize more of your work"
          creating={creating}
          atCap={atCap}
          empty={false}
          onToggleCreating={setCreating}
        />
      </header>
      {gatePanel}
      {composer}
      {activeProjects.length > 0 && (
        <RecordCardGrid>
        {activeProjects.map((p: ProjectRow) => {
          const total = p.openCount + p.doneCount;
          const pct = total === 0 ? 0 : Math.round((p.doneCount / total) * 100);
          return (
            <ProgressCard
              key={p.id}
              className="aa-project-card"
              to={`/do/projects/${p.permalink}`}
              title={p.name}
              description={p.description}
              progress={pct}
              progressLabel={`${p.doneCount}/${total} done`}
              meta={
                <>
                  <span>{p.goal?.name ?? "Standalone"}</span>
                  <span className="aa-projects__dot" aria-hidden="true">·</span>
                  <span>{p.openCount} open</span>
                  <span className="aa-projects__dot" aria-hidden="true">·</span>
                  <span>{p.doneCount} done</span>
                  {p.dueDate && <Chip variant="teal" small>{formatRelativeDue(p.dueDate)}</Chip>}
                </>
              }
              focusLabel={p.nextAction ? "Focus" : "Status"}
              focusValue={p.nextAction?.description ?? "No next action"}
              focusTone={p.nextAction ? "amber" : "muted"}
            />
          );
        })}
        </RecordCardGrid>
      )}
      {completedProjects.length > 0 && (
        <section className="aa-projects__completed" aria-labelledby="completed-projects-heading">
          <div className="aa-projects__section-head">
            <h2 id="completed-projects-heading">Completed</h2>
            <span>{completedProjects.length}</span>
          </div>
          <RecordCardGrid>
            {completedProjects.map((p: ProjectRow) => {
              const total = p.openCount + p.doneCount;
              const pct = total === 0 ? 0 : Math.round((p.doneCount / total) * 100);
              return (
                <ProgressCard
                  key={p.id}
                  className="aa-project-card aa-project-card--completed"
                  to={`/do/projects/${p.permalink}`}
                  title={p.name}
                  description={p.description}
                  progress={pct}
                  progressLabel={`${p.doneCount}/${total} done`}
                  meta={<><span>{p.goal?.name ?? "Standalone"}</span><span className="aa-projects__dot" aria-hidden="true">·</span><span>Completed</span></>}
                  focusLabel="Status"
                  focusValue="Manage, archive, or delete"
                  focusTone="muted"
                />
              );
            })}
          </RecordCardGrid>
        </section>
      )}
    </div>
  );
}
