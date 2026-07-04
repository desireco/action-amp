import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getGoal,
  createTask,
  createProject,
  updateTaskStatus,
  setGoalDone,
  updateGoal,
  deleteGoal,
  reorderGoalProjects,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Chip,
  TaskRow,
  CompletionCircle,
  ConfirmDialog,
  type TaskRowTask,
} from "../components/ui";
import { CreateInline } from "../lists/CreateInline";
import type { GroupDef } from "../components/ui";
import "./GoalDetailPage.css";

type GoalTask = TaskRowTask & {
  status: "TODAY" | "UPCOMING" | "SOMEDAY";
};

type LinkedProject = {
  id: string;
  name: string;
  isDone: boolean;
  order: number;
  dueDate: Date | string | null;
  tasks: { id: string; isDone: boolean }[];
};

type GoalData = {
  id: string;
  name: string;
  description: string | null;
  isDone: boolean;
  lensId: string;
  tasks: GoalTask[];
  projects: LinkedProject[];
};

/**
 * Goal detail — the dedicated URL for working on a single Goal. Mirrors
 * ProjectDetailPage's shape, scoped to a Goal: header with aggregate progress,
 * the goal's standalone tasks grouped by horizon (Today/Upcoming/Someday/Done),
 * and the list of projects linked to this goal (each its own linkable detail).
 *
 * Header affordances (goal-planning spec §B, §C, §E): Complete / Reopen, inline
 * edit of name + description, delete (lossless — children re-parent to
 * standalone in this Lens), add-task AND add-project (auto-linked), the muted
 * "Next: <project>" line, and up/down reorder of the linked-projects sequence.
 *
 * The goal's lensId is taken from the record itself (not the active sidebar
 * lens), so anything added here always joins the right lens.
 */
export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: goal, isLoading, error } = useQuery(getGoal, { id: id! });
  // createMode drives CreateInline: "task" (standalone) or "project".
  const [createMode, setCreateMode] = useState<"task" | "project" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Header affordances: edit, confirm-delete. Each opens a small inline surface
  // or the centered ConfirmDialog (the codebase's standard confirm pattern).
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Reorder in-flight count, used to disable the buttons while a write settles.
  const [reordering, setReordering] = useState(false);

  // Standalone tasks grouped by horizon (same buckets as Project detail).
  const groups = useMemo<GroupDef<GoalTask>[]>(() => {
    if (!goal) return [];
    const buckets: Record<string, GoalTask[]> = { TODAY: [], UPCOMING: [], SOMEDAY: [], DONE: [] };
    for (const t of goal.tasks) {
      (t.isDone ? buckets.DONE : buckets[t.status] ?? buckets.SOMEDAY).push(t);
    }
    return [
      { key: "TODAY", label: "Today", items: buckets.TODAY },
      { key: "UPCOMING", label: "Upcoming", items: buckets.UPCOMING },
      { key: "SOMEDAY", label: "Someday", items: buckets.SOMEDAY },
      { key: "DONE", label: "Done", items: buckets.DONE },
    ];
  }, [goal]);

  // Aggregate progress — MUST match getGoals' rollup so the list-card % and
  // this header % agree. (See the long comment in the prior revision; the
  // formula is unchanged.)
  const { progress, totalItems, doneItems } = useMemo(() => {
    if (!goal) return { progress: 0, totalItems: 0, doneItems: 0 };
    const projectsDone = goal.projects.filter((p) => p.isDone).length;
    const projectsTotal = goal.projects.length;
    const tasksDone = goal.tasks.filter((t) => t.isDone).length;
    const tasksTotal = goal.tasks.length;
    const done = projectsDone + tasksDone;
    const total = projectsTotal + tasksTotal;
    return {
      progress: total === 0 ? 0 : Math.round((done / total) * 100),
      totalItems: total,
      doneItems: done,
    };
  }, [goal]);

  // "Next" project — first non-done in sequence order (goal-planning spec §E).
  // The list is already ordered [order, name] by getGoal, so the first non-done
  // entry is the next toward this goal. Absent when all projects are done or
  // there are none — no fabricated content.
  const nextProject = useMemo(
    () => goal?.projects.find((p) => !p.isDone) ?? null,
    [goal],
  );

  const setStatus = async (task: GoalTask, status: GoalTask["status"]) => {
    await updateTaskStatus({ id: task.id, status });
    queryClient.invalidateQueries({ queryKey: ["getGoal"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  const handleCreateTask = async (description: string) => {
    if (!goal) return;
    setSubmitting(true);
    try {
      await createTask({ description, lensId: goal.lensId, goalId: goal.id });
      queryClient.invalidateQueries({ queryKey: ["getGoal"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setCreateMode(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Create a project auto-linked to this goal (spec §C). The new project seeds
  // at the end of the goal's sequence (createProject handles order seeding).
  const handleCreateProject = async (name: string) => {
    if (!goal) return;
    setSubmitting(true);
    try {
      await createProject({ name, lensId: goal.lensId, goalId: goal.id });
      queryClient.invalidateQueries({ queryKey: ["getGoal"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setCreateMode(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!goal) return;
    await setGoalDone({ id: goal.id, isDone: !goal.isDone });
    queryClient.invalidateQueries({ queryKey: ["getGoal"] });
    queryClient.invalidateQueries({ queryKey: ["getGoals"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    // After completing, leave the detail page — the goal no longer shows in the
    // active list. Reopen stays reachable from the Logbook.
    if (!goal.isDone) navigate("/app/goals");
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
    navigate("/app/goals");
  };

  // Reorder: swap a project with its neighbor and write the full new order.
  // We send the complete ordered id list (order = index for each) — the op is
  // idempotent and tenancy-checked.
  const handleReorder = async (index: number, direction: -1 | 1) => {
    if (!goal || reordering) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= goal.projects.length) return;
    const orderedIds = goal.projects.map((p) => p.id);
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

  const standaloneTotal = goal?.tasks.length ?? 0;
  // Counts for the delete confirm copy: "N children will move to standalone."
  const childCount = (goal?.projects.length ?? 0) + standaloneTotal;

  return (
    <div className="aa-goal">
      <Link className="aa-task-back" to="/app/goals">
        ← Goals
      </Link>

      {isLoading && <p className="aa-task-state">Loading…</p>}

      {error && <div className="aa-task-state aa-task-err">Couldn't load this goal.</div>}

      {goal && (
        <>
          <header className="aa-list-header aa-goal__header">
            <div className="aa-goal__header-main">
              {editing ? (
                <div className="aa-goal__edit">
                  <input
                    className="aa-goal__edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Goal name"
                    aria-label="Goal name"
                  />
                  <textarea
                    className="aa-goal__edit-desc"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Description (optional)"
                    aria-label="Goal description"
                    rows={2}
                  />
                  {editError && <p className="aa-goal__edit-err">{editError}</p>}
                  <div className="aa-goal__edit-actions">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleSaveEdit}>
                      Save
                    </Button>
                  </div>
                </div>
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
                      Next: <Link to={`/app/projects/${nextProject.id}`}>{nextProject.name}</Link>
                    </p>
                  )}
                </>
              )}
            </div>
            {!editing && (
              <div className="aa-goal__header-actions">
                <Button variant="ghost" size="sm" onClick={startEdit}>Edit</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleComplete}
                  title={goal.isDone ? "Return to active goals" : "Mark this goal done"}
                >
                  {goal.isDone ? "Reopen" : "Complete"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCreateMode((m) => (m === "project" ? null : "project"))}
                >
                  {createMode === "project" ? "Cancel" : "Add project"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCreateMode((m) => (m === "task" ? null : "task"))}
                >
                  {createMode === "task" ? "Cancel" : "Add task"}
                </Button>
              </div>
            )}
          </header>

          {!editing && goal.description && <p className="aa-goal__desc">{goal.description}</p>}

          {createMode && (
            <CreateInline
              placeholder={createMode === "task" ? "What needs doing?" : "Project name"}
              onCreate={createMode === "task" ? handleCreateTask : handleCreateProject}
              onCancel={() => setCreateMode(null)}
              submitting={submitting}
            />
          )}

          {/* Linked projects — each linkable, with up/down reorder (spec §E). */}
          {goal.projects.length > 0 && (
            <section className="aa-goal__projects">
              <h3 className="aa-grouped__heading">
                Projects <span className="aa-grouped__count">{goal.projects.length}</span>
              </h3>
              <ul className="aa-grouped__list">
                {goal.projects.map((p, index) => {
                  const pDone = p.tasks.filter((t) => t.isDone).length;
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
                      <Link to={`/app/projects/${p.id}`} className="aa-goal__project-link">
                        <span className="aa-goal__project-name">{p.name}</span>
                        {p.isDone && <Chip variant="muted" small>Done</Chip>}
                        {pTotal > 0 && <span className="aa-goal__project-pct">{pct}%</span>}
                        {p.dueDate && <Chip variant="teal" small>{formatDue(p.dueDate)}</Chip>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Standalone tasks under this goal, grouped by horizon. */}
          {standaloneTotal === 0 ? (
            <div className="aa-list-empty aa-goal__empty">
              <div className="aa-list-empty__icon"><CompletionCircle size="md" /></div>
              <h2 className="aa-list-empty__title">No standalone tasks.</h2>
              <p className="aa-list-empty__text">
                {goal.projects.length > 0
                  ? "Tasks live in this goal's projects — or add a standalone one here."
                  : "Add the first step — a task lands on Upcoming and shows on Next."}
              </p>
            </div>
          ) : (
            <div className="aa-grouped">
              {groups.map((group) => {
                if (group.items.length === 0) return null;
                return (
                  <section key={group.key} className="aa-grouped__group">
                    <h3 className="aa-grouped__heading">
                      {group.label}
                      <span className="aa-grouped__count">{group.items.length}</span>
                    </h3>
                    <ul className="aa-grouped__list">
                      {group.items.map((task) => (
                        <li key={task.id} className="aa-grouped__item aa-goal__row">
                          <TaskRow
                            task={task}
                            muted={task.status === "SOMEDAY" || task.isDone}
                            onOpen={() => navigate(`/app/tasks/${task.id}`)}
                          />
                          {!task.isDone && (
                            <div className="aa-goal__horizon">
                              {task.status !== "TODAY" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setStatus(task, task.status === "SOMEDAY" ? "UPCOMING" : "TODAY")}
                                >
                                  {task.status === "SOMEDAY" ? "Upcoming" : "Today"}
                                </Button>
                              )}
                              {task.status === "TODAY" && (
                                <Button variant="ghost" size="sm" onClick={() => setStatus(task, "UPCOMING")}>
                                  Not today
                                </Button>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
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

function formatDue(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
