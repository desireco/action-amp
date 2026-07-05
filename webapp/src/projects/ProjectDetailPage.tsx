import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getProject,
  getGoals,
  getProjects,
  createTask,
  updateTaskStatus,
  setProjectDone,
  updateProject,
  deleteProject,
  updateTask,
  updateTaskContent,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Chip,
  TaskRow,
  CompletionCircle,
  ConfirmDialog,
  DetailHeaderActions,
  InlineEntityEditForm,
  type TaskRowTask,
} from "../components/ui";
import { CreateInline } from "../lists/CreateInline";
import type { GroupDef } from "../components/ui";
import { formatRelativeDue } from "../shared/dateFormat";
import "./ProjectDetailPage.css";

type ProjectTask = TaskRowTask & {
  status: "TODAY" | "UPCOMING" | "SOMEDAY";
};

type ProjectData = {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  dueDate: Date | string | null;
  isDone: boolean;
  order: number;
  lensId: string;
  goal: { id: string; permalink: string; name: string } | null;
  tasks: ProjectTask[];
};

type GoalOption = { id: string; permalink: string; name: string };
type ProjectOption = { id: string; permalink: string; name: string };

/**
 * Project detail — the dedicated URL for working on a single Project. Shows its
 * tasks grouped by horizon (Today / Upcoming / Someday / Done), lets you add a
 * task inline, complete one, or move it between horizons.
 *
 * Header affordances (goal-planning spec §B, §C): Complete / Reopen, inline
 * edit of name + description, delete (lossless — child tasks re-parent to
 * standalone in this Lens, retaining their goalId), and an editable parent
 * Goal (re-link to a different goal in this Lens, or unlink).
 *
 * The project's lensId is taken from the record itself (not the active sidebar
 * lens), so a task you add here always joins the right lens.
 */
export function ProjectDetailPage() {
  const { permalink } = useParams<{ permalink: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: project, isLoading, error } = useQuery(getProject, { id: permalink! });
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Header affordances: edit, re-link picker, confirm-delete.
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [relinkError, setRelinkError] = useState<string | null>(null);

  // Re-link picker: fetch goals in the project's lens for the dropdown. Only
  // active goals (isDone:false) — you don't re-link to a completed goal.
  const [pickingGoal, setPickingGoal] = useState(false);
  const { data: lensGoals } = useQuery(
    getGoals,
    project ? { lensId: project.lensId } : undefined,
    { enabled: !!project && pickingGoal },
  );

  // Move-task picker (§C "move to project" affordance on task rows). When set,
  // this is the id of the task whose row is showing the picker; at most one row
  // expands at a time. We fetch the project's siblings (same Lens) and offer
  // them + an unlink-to-standalone option.
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const { data: lensProjects } = useQuery(
    getProjects,
    project ? { lensId: project.lensId } : undefined,
    { enabled: !!project && movingTaskId !== null },
  );
  // Siblings only — a task can't move to the project it's already in.
  const moveTargets: ProjectOption[] = (lensProjects ?? [])
    .filter((p: ProjectOption) => p.id !== project?.id);

  // Group the project's tasks by horizon. Open tasks split into Today / Upcoming
  // / Someday; done ones collect at the bottom.
  const groups = useMemo<GroupDef<ProjectTask>[]>(() => {
    if (!project) return [];
    const buckets: Record<string, ProjectTask[]> = { TODAY: [], UPCOMING: [], SOMEDAY: [], DONE: [] };
    for (const t of project.tasks) {
      (t.isDone ? buckets.DONE : buckets[t.status] ?? buckets.SOMEDAY).push(t);
    }
    return [
      { key: "TODAY", label: "Today", items: buckets.TODAY },
      { key: "UPCOMING", label: "Upcoming", items: buckets.UPCOMING },
      { key: "SOMEDAY", label: "Someday", items: buckets.SOMEDAY },
      { key: "DONE", label: "Done", items: buckets.DONE },
    ];
  }, [project]);

  const doneCount = project?.tasks.filter((t) => t.isDone).length ?? 0;
  const total = project?.tasks.length ?? 0;

  const setStatus = async (task: ProjectTask, status: ProjectTask["status"]) => {
    await updateTaskStatus({ id: task.id, status });
    queryClient.invalidateQueries({ queryKey: ["getProject"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  const handleCreate = async (description: string) => {
    if (!project) return;
    setSubmitting(true);
    try {
      await createTask({ description, lensId: project.lensId, projectId: project.id });
      queryClient.invalidateQueries({ queryKey: ["getProject"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setCreating(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveTaskContent = async (task: TaskRowTask, content: string) => {
    await updateTaskContent({ taskId: task.id, content });
    queryClient.invalidateQueries({ queryKey: ["getProject"] });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
  };

  const handleComplete = async () => {
    if (!project) return;
    await setProjectDone({ id: project.id, isDone: !project.isDone });
    queryClient.invalidateQueries({ queryKey: ["getProject"] });
    queryClient.invalidateQueries({ queryKey: ["getProjects"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    // After completing, leave the detail page — the project leaves the active
    // list. Reopen reachable from the Logbook.
    if (!project.isDone) navigate("/app/projects");
  };

  const startEdit = () => {
    if (!project) return;
    setEditName(project.name);
    setEditDesc(project.description ?? "");
    setEditError(null);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!project) return;
    setEditError(null);
    try {
      await updateProject({
        id: project.id,
        name: editName,
        // Server trims + normalizes empty → null.
        description: editDesc,
      });
      queryClient.invalidateQueries({ queryKey: ["getProject"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Couldn't save.");
    }
  };

  // Re-link: set goalId (different goal in this Lens) or null (unlink). The
  // server enforces the same-Lens invariant; an error here surfaces inline.
  const handleRelink = async (goalId: string | null) => {
    if (!project) return;
    setRelinkError(null);
    try {
      await updateProject({ id: project.id, goalId });
      queryClient.invalidateQueries({ queryKey: ["getProject"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setPickingGoal(false);
    } catch (e) {
      setRelinkError(e instanceof Error ? e.message : "Couldn't change the goal.");
    }
  };

  // Move a task out of this project (§C). targetProjectId === null means
  // unlink to standalone (keep any goal link). The op enforces one-parent +
  // same-Lens rules; an error surfaces inline on the row's picker.
  const handleMoveTask = async (taskId: string, targetProjectId: string | null) => {
    setMoveError(null);
    try {
      await updateTask({ id: taskId, projectId: targetProjectId });
      queryClient.invalidateQueries({ queryKey: ["getProject"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setMovingTaskId(null);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : "Couldn't move the task.");
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    await deleteProject({ id: project.id });
    queryClient.invalidateQueries({ queryKey: ["getProjects"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getGoals"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    setConfirmDelete(false);
    navigate("/app/projects");
  };

  return (
    <div className="aa-project">
      <Link className="aa-task-back" to="/app/projects">
        ← Projects
      </Link>

      {isLoading && <p className="aa-task-state">Loading…</p>}

      {error && <div className="aa-task-state aa-task-err">Couldn't load this project.</div>}

      {project && (
        <>
          <header className="aa-list-header aa-project__header">
            <div className="aa-project__header-main">
              {editing ? (
                <InlineEntityEditForm
                  title="Refine project"
                  subtitle="Keep the outcome concrete. The notes can stay practical."
                  nameLabel="Project"
                  name={editName}
                  namePlaceholder="Project name"
                  descriptionLabel="What makes it done"
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
                  <div className="aa-list-header__eyebrow">
                    Project{project.goal ? ` · ${project.goal.name}` : ""}
                  </div>
                  <h1 className="aa-list-header__title">{project.name}</h1>
                  {(total > 0 || project.dueDate) && (
                    <p className="aa-project__meta">
                      {total > 0 && <span>{doneCount}/{total} done</span>}
                      {project.dueDate && (
                        <Chip variant="teal" small>{formatRelativeDue(project.dueDate)}</Chip>
                      )}
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
                    label: project.isDone ? "Reopen" : "Complete",
                    onClick: handleComplete,
                    title: project.isDone ? "Return to active projects" : "Mark this project done",
                  },
                  { label: "Delete", onClick: () => setConfirmDelete(true), danger: true },
                  { label: creating ? "Cancel" : "Add task", onClick: () => setCreating((v) => !v) },
                ]}
              />
            )}
          </header>

          {!editing && project.description && (
            <p className="aa-project__desc">{project.description}</p>
          )}

          {/* Re-link to a goal (spec §C). An editable parent field, not a
              birth-only assignment. */}
          {!editing && (
            <div className="aa-project__relink">
              <span className="aa-project__relink-label">Goal</span>
              {pickingGoal ? (
                <div className="aa-project__relink-picker">
                  <button
                    type="button"
                    className={`aa-project__relink-opt ${project.goal === null ? "is-active" : ""}`}
                    onClick={() => void handleRelink(null)}
                  >
                    None (standalone)
                  </button>
                  {(lensGoals ?? []).map((g: GoalOption) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`aa-project__relink-opt ${project.goal?.id === g.id ? "is-active" : ""}`}
                      onClick={() => void handleRelink(g.id)}
                    >
                      {g.name}
                    </button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setPickingGoal(false)}>
                    Cancel
                  </Button>
                  {relinkError && <p className="aa-project__inline-err">{relinkError}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  className="aa-project__relink-value"
                  onClick={() => setPickingGoal(true)}
                >
                  {project.goal ? project.goal.name : "None — click to link a goal"}
                </button>
              )}
            </div>
          )}

          {creating && (
            <CreateInline
              placeholder="What needs doing?"
              onCreate={handleCreate}
              onCancel={() => setCreating(false)}
              submitting={submitting}
            />
          )}

          {total === 0 ? (
            <div className="aa-list-empty aa-project__empty">
              <div className="aa-list-empty__icon"><CompletionCircle size="md" /></div>
              <h2 className="aa-list-empty__title">No tasks yet.</h2>
              <p className="aa-list-empty__text">
                Add the first step — a task lands on Upcoming and shows on Next.
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
                        <TaskRow
                          key={task.id}
                          className="aa-grouped__item aa-project__row"
                          task={task}
                          muted={task.status === "SOMEDAY" || task.isDone}
                          onOpen={() => navigate(`/app/tasks/${task.id}`)}
                          onSaveContent={handleSaveTaskContent}
                        >
                          {!task.isDone && (
                            <div className="aa-project__horizon">
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
                              {/* §C "move to project" affordance — opens an inline
                                  picker scoped to the project's Lens. */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setMovingTaskId((cur) => (cur === task.id ? null : task.id));
                                  setMoveError(null);
                                }}
                                aria-expanded={movingTaskId === task.id}
                                aria-label={`Move ${task.description} to another project`}
                              >
                                Move
                              </Button>
                            </div>
                          )}
                          {movingTaskId === task.id && (
                            <div className="aa-project__move-picker">
                              <span className="aa-project__move-hint">Move to:</span>
                              {/* Unlink to standalone (keep any goal link). */}
                              <button
                                type="button"
                                className="aa-project__relink-opt"
                                onClick={() => void handleMoveTask(task.id, null)}
                              >
                                Standalone
                              </button>
                              {moveTargets.length === 0 && (
                                <span className="aa-project__move-empty">
                                  No other projects in this Lens.
                                </span>
                              )}
                              {moveTargets.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="aa-project__relink-opt"
                                  onClick={() => void handleMoveTask(task.id, p.id)}
                                >
                                  {p.name}
                                </button>
                              ))}
                              <Button variant="ghost" size="sm" onClick={() => setMovingTaskId(null)}>
                                Cancel
                              </Button>
                              {moveError && <p className="aa-project__inline-err">{moveError}</p>}
                            </div>
                          )}
                        </TaskRow>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {!isLoading && !error && !project && (
        <p className="aa-task-state">This project doesn't exist — or isn't yours.</p>
      )}

      {confirmDelete && project && (
        <ConfirmDialog
          title="Delete this project?"
          message={
            total > 0
              ? `${total} ${total === 1 ? "task will move" : "tasks will move"} to standalone in this Lens (keeping any goal link). The project itself will be removed.`
              : "This project will be removed. No tasks are in it."
          }
          confirmLabel="Delete project"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
