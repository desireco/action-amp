import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getGoal,
  setGoalDone,
  updateGoal,
  deleteGoal,
  reorderGoalProjects,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import {
  Breadcrumb,
  Chip,
  ConfirmDialog,
  DetailHeaderActions,
  InlineEntityEditForm,
} from "../components/ui";
import type { BreadcrumbItem } from "../components/ui";
import { formatRelativeDue } from "../shared/dateFormat";
import "./GoalDetailView.css";

type LinkedProject = {
  id: string;
  permalink: string;
  name: string;
  isDone: boolean;
  order: number;
  dueDate: Date | string | null;
  tasks: { id: string; isDone: boolean }[];
};

/**
 * Goal detail — the dedicated URL for working on a single Goal. Mirrors
 * Goal detail — the dedicated URL for understanding why a set of Projects
 * exists. Goals do not own Tasks; undefined work goes through Inbox, and
 * actionable work lives inside Projects.
 *
 * Header affordances (goal-planning spec §B, §C, §E): Complete / Reopen, inline
 * edit of name + description, delete/archive flow, the muted
 * "Focus: <project>" line, and the linked projects/progress list.
 */
export function GoalDetailPage() {
  const { permalink } = useParams<{ permalink: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: goal, isLoading, error } = useQuery(getGoal, { id: permalink! });

  // Header affordances: edit, confirm-delete. Each opens a small inline surface
  // or the centered ConfirmDialog (the codebase's standard confirm pattern).
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Reorder in-flight count, used to disable the buttons while a write settles.
  const [reordering, setReordering] = useState(false);

  // Aggregate progress — MUST match getGoals' rollup so the list-card % and
  // this header % agree. (See the long comment in the prior revision; the
  // formula is unchanged.)
  const { progress, totalItems, doneItems } = useMemo(() => {
    if (!goal) return { progress: 0, totalItems: 0, doneItems: 0 };
    const projectsDone = goal.projects.filter((p: LinkedProject) => p.isDone).length;
    const projectsTotal = goal.projects.length;
    return {
      progress: projectsTotal === 0 ? 0 : Math.round((projectsDone / projectsTotal) * 100),
      totalItems: projectsTotal,
      doneItems: projectsDone,
    };
  }, [goal]);

  // "Focus" project — first non-done in sequence order (goal-planning spec §E).
  // The list is already ordered [order, name] by getGoal, so the first non-done
  // entry is the focus toward this goal. Absent when all projects are done or
  // there are none — no fabricated content.
  const nextProject = useMemo(
    () => goal?.projects.find((p: LinkedProject) => !p.isDone) ?? null,
    [goal],
  );

  const handleComplete = async () => {
    if (!goal) return;
    await setGoalDone({ id: goal.id, isDone: !goal.isDone });
    queryClient.invalidateQueries({ queryKey: ["getGoal"] });
    queryClient.invalidateQueries({ queryKey: ["getGoals"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    // After completing, leave the detail page — the goal no longer shows in the
    // active list. Reopen stays reachable from the Logbook.
    if (!goal.isDone) navigate("/do/goals");
  };

  const startEdit = () => {
    if (!goal) return;
    setEditName(goal.name);
    setEditDesc(goal.description ?? "");
    setEditError(null);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!goal) return;
    setEditError(null);
    try {
      await updateGoal({
        id: goal.id,
        name: editName,
        // The server op trims + normalizes empty → null (clears). Wasp's
        // client type rejects null on the wire (JSON-RPC), so we pass the
        // raw string and let the op do the empty→null conversion.
        description: editDesc,
      });
      queryClient.invalidateQueries({ queryKey: ["getGoal"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Couldn't save.");
    }
  };

  const handleDelete = async () => {
    if (!goal) return;
    await deleteGoal({ id: goal.id });
    queryClient.invalidateQueries({ queryKey: ["getGoals"] });
    queryClient.invalidateQueries({ queryKey: ["getProjects"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    setConfirmDelete(false);
    navigate("/do/goals");
  };

  // Reorder: swap a project with its neighbor and write the full new order.
  // We send the complete ordered id list (order = index for each) — the op is
  // idempotent and tenancy-checked.
  const handleReorder = async (index: number, direction: -1 | 1) => {
    if (!goal || reordering) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= goal.projects.length) return;
    const orderedIds = goal.projects.map((p: LinkedProject) => p.id);
    [orderedIds[index], orderedIds[newIndex]] = [orderedIds[newIndex], orderedIds[index]];
    setReordering(true);
    try {
      await reorderGoalProjects({ goalId: goal.id, orderedIds });
      queryClient.invalidateQueries({ queryKey: ["getGoal"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
    } finally {
      setReordering(false);
    }
  };

  // Counts for the delete confirm copy: "N children will move to standalone."
  const childCount = goal?.projects.length ?? 0;

  // Breadcrumb: Goals list › this goal (goal has no parent entity).
  // Crumb id IS the destination route.
  const goalActiveRoute = goal ? `/do/goals/${goal.permalink}` : "";
  const goalCrumbs: BreadcrumbItem[] = [
    { id: "/do/goals", label: "Goals" },
  ];
  if (goal) goalCrumbs.push({ id: goalActiveRoute, label: goal.name || "Goal" });

  const handleCrumbSelect = (dest: string) => {
    if (dest !== goalActiveRoute) navigate(dest);
  };

  return (
    <div className="aa-goal">
      {goal ? (
        <Breadcrumb
          items={goalCrumbs}
          active={goalActiveRoute}
          onSelect={handleCrumbSelect}
        />
      ) : (
        <Link className="aa-task-back" to="/do/goals">
          ← Goals
        </Link>
      )}

      {isLoading && <p className="aa-task-state">Loading…</p>}

      {error && <div className="aa-task-state aa-task-err">Couldn't load this goal.</div>}

      {goal && (
        <>
          <header className="aa-list-header aa-goal__header">
            <div className="aa-goal__header-main">
              {editing ? (
                <InlineEntityEditForm
                  title="Refine goal"
                  subtitle="Keep the outcome clear. The why can stay plain."
                  nameLabel="Outcome"
                  name={editName}
                  namePlaceholder="Goal name"
                  descriptionLabel="Why this matters"
                  description={editDesc}
                  descriptionPlaceholder="Description (optional)"
                  error={editError}
                  onNameChange={setEditName}
                  onDescriptionChange={setEditDesc}
                  onCancel={() => setEditing(false)}
                  onSave={handleSaveEdit}
                />
              ) : (
                <>
                  <div className="aa-list-header__eyebrow">Goal</div>
                  <h1 className="aa-list-header__title">{goal.name}</h1>
                  {totalItems > 0 && (
                    <p className="aa-goal__meta">
                      <span>{doneItems}/{totalItems} done · {progress}%</span>
                    </p>
                  )}
                  {nextProject && (
                    <p className="aa-goal__next">
                      Focus: <Link to={`/do/projects/${nextProject.permalink}`}>{nextProject.name}</Link>
                    </p>
                  )}
                </>
              )}
            </div>
            {!editing && (
              <DetailHeaderActions
                actions={[
                  { label: "Edit", onClick: startEdit },
                  {
                    label: goal.isDone ? "Reopen" : "Complete",
                    onClick: handleComplete,
                    title: goal.isDone ? "Return to active goals" : "Mark this goal done",
                  },
                  { label: "Delete", onClick: () => setConfirmDelete(true), danger: true },
                ]}
              />
            )}
          </header>

          {!editing && goal.description && <p className="aa-goal__desc">{goal.description}</p>}

          {/* Linked projects — each linkable, with up/down reorder (spec §E). */}
          {goal.projects.length > 0 ? (
            <section className="aa-goal__projects">
              <h3 className="aa-grouped__heading">
                Projects <span className="aa-grouped__count">{goal.projects.length}</span>
              </h3>
              <ul className="aa-grouped__list">
                {goal.projects.map((p: LinkedProject, index: number) => {
                  const pDone = p.tasks.filter((t: { id: string; isDone: boolean }) => t.isDone).length;
                  const pTotal = p.tasks.length;
                  const pct = pTotal === 0 ? 0 : Math.round((pDone / pTotal) * 100);
                  return (
                    <li key={p.id} className="aa-grouped__item aa-goal__project-row">
                      <div className="aa-goal__project-reorder">
                        <button
                          type="button"
                          className="aa-goal__reorder-btn"
                          disabled={reordering || index === 0}
                          onClick={() => handleReorder(index, -1)}
                          aria-label={`Move ${p.name} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="aa-goal__reorder-btn"
                          disabled={reordering || index === goal.projects.length - 1}
                          onClick={() => handleReorder(index, 1)}
                          aria-label={`Move ${p.name} down`}
                        >
                          ↓
                        </button>
                      </div>
                      <Link to={`/do/projects/${p.permalink}`} className="aa-goal__project-link">
                        <span className="aa-goal__project-name">{p.name}</span>
                        {p.isDone && <Chip variant="muted" small>Done</Chip>}
                        {pTotal > 0 && <span className="aa-goal__project-pct">{pct}%</span>}
                        {p.dueDate && <Chip variant="teal" small>{formatRelativeDue(p.dueDate)}</Chip>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <section className="aa-goal__projects-empty">
              <h2>No supporting projects yet.</h2>
              <p>Assign projects to this goal from their Project detail page.</p>
            </section>
          )}
        </>
      )}

      {!isLoading && !error && !goal && (
        <p className="aa-task-state">This goal doesn't exist — or isn't yours.</p>
      )}

      {confirmDelete && goal && (
        <ConfirmDialog
          title="Delete this goal?"
          message={
            childCount > 0
              ? `${childCount} ${childCount === 1 ? "item" : "items"} will move to standalone in this Lens. The goal itself will be removed.`
              : "This goal will be removed. No items are linked to it."
          }
          confirmLabel="Delete goal"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
