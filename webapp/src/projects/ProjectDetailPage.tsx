import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getProject,
  getGoals,
  getProjects,
  createTask,
  updateTaskStatus,
  startTask,
  setProjectDone,
  updateProject,
  deleteProject,
  updateTask,
} from "wasp/client/operations";
import { Breadcrumb } from "../components/ui";
import type { BreadcrumbItem } from "../components/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Chip,
  TaskRow,
  CompletionCircle,
  ConfirmDialog,
  InlineEntityEditForm,
  PlusIcon,
  ArrowRightIcon,
  type TaskRowTask,
} from "../components/ui";
import { CreateInline } from "../lists/CreateInline";
import type { GroupDef } from "../components/ui";
import { formatRelativeDue } from "../shared/dateFormat";
import "./ProjectDetailPage.css";

type ProjectTask = TaskRowTask & {
  status: "TODAY" | "UPCOMING" | "SOMEDAY";
  completedAt: Date | string | null;
};

/** Size → human duration, matching the home screen (focusTaskView.sizeLabel). */
const SIZE_DURATION: Record<string, string> = {
  S: "15 min",
  M: "30 min",
  L: "1 hr",
  XL: "2 hr+",
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

  const {
    data: project,
    isLoading,
    error,
  } = useQuery(getProject, { id: permalink! });
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

  // Header overflow menu (Edit/Complete/Add are surfaced; Delete is destructive
  // and lives behind ⋯ so it can't be tapped by accident).
  const [overflowOpen, setOverflowOpen] = useState(false);
  const { data: lensProjects } = useQuery(
    getProjects,
    project ? { lensId: project.lensId } : undefined,
    { enabled: !!project && movingTaskId !== null },
  );
  // Siblings only — a task can't move to the project it's already in.
  const moveTargets: ProjectOption[] = (lensProjects ?? []).filter(
    (p: ProjectOption) => p.id !== project?.id,
  );

  // Group the project's tasks by horizon. Open tasks split into Today / Upcoming
  // / Someday; done ones collect at the bottom.
  const groups = useMemo<GroupDef<ProjectTask>[]>(() => {
    if (!project) return [];
    const buckets: Record<string, ProjectTask[]> = {
      TODAY: [],
      UPCOMING: [],
      SOMEDAY: [],
      DONE: [],
    };
    for (const t of project.tasks) {
      (t.isDone ? buckets.DONE : (buckets[t.status] ?? buckets.SOMEDAY)).push(
        t,
      );
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
  const progressPct =
    project && total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Momentum header stats — Open, Done this week, Today. Computed from the
  // already-loaded task list (no extra query). "This week" = last 7 days,
  // measured from completedAt (set when a task is marked done).
  const openCount = total - doneCount;
  const todayOpenCount =
    (project?.tasks ?? []).filter(
      (t) => !t.isDone && t.status === "TODAY",
    ).length;
  const doneThisWeek =
    (project?.tasks ?? []).filter((t) => {
      if (!t.isDone || !t.completedAt) return false;
      const ageMs = Date.now() - new Date(t.completedAt).getTime();
      return ageMs <= 7 * 86_400_000;
    }).length ?? 0;

  // Next-step candidate: the single TODAY task, lifted out as a pointer only
  // when there is exactly one. With zero or 2+ TODAY tasks the Today group
  // renders normally — we don't fabricate a winner from a tie.
  const todayTasks = useMemo(
    () => (project?.tasks ?? []).filter((t) => !t.isDone && t.status === "TODAY"),
    [project],
  );
  const nextStep = todayTasks.length === 1 ? todayTasks[0] : null;

  // "Nothing queued for today" cue — shown only when there are zero open Today
  // tasks AND at least one open Upcoming task to promote. Today is a commitment
  // in this app (WORKFLOW §2.2), so we never auto-pull an Upcoming task into a
  // hero; the cue just names the situation and points at the rows below.
  const hasUpcoming = useMemo(
    () =>
      (project?.tasks ?? []).some((t) => !t.isDone && t.status === "UPCOMING"),
    [project],
  );
  const showNoTodayCue =
    !nextStep && todayTasks.length === 0 && hasUpcoming;

  const setStatus = async (
    task: ProjectTask,
    status: ProjectTask["status"],
  ) => {
    await updateTaskStatus({ id: task.id, status });
    queryClient.invalidateQueries({ queryKey: ["getProject"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  // Do-this on the Next-step region: start the task and drop into focus mode.
  // Mirrors NextPage.handleStart (webapp/src/app/NextPage.tsx) — same ops, same
  // invalidations, same /app/focus navigation — so the project page's Do-this
  // is the same loop as the home screen's.
  const handleStart = async (task: ProjectTask) => {
    await startTask({ id: task.id });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
    queryClient.invalidateQueries({ queryKey: ["getProject"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    navigate("/app/focus");
  };

  const handleCreate = async (description: string) => {
    if (!project) return;
    setSubmitting(true);
    try {
      await createTask({
        description,
        lensId: project.lensId,
        projectId: project.id,
      });
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
      setRelinkError(
        e instanceof Error ? e.message : "Couldn't change the goal.",
      );
    }
  };

  // Move a task out of this project (§C). targetProjectId === null means
  // unlink to standalone (keep any goal link). The op enforces one-parent +
  // same-Lens rules; an error surfaces inline on the row's picker.
  const handleMoveTask = async (
    taskId: string,
    targetProjectId: string | null,
  ) => {
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

  // Breadcrumb chain: Goal › Project. A "Projects" list root is always present
  // so there's always a way back to /app/projects even when the project has no
  // goal ancestor. Crumb id IS the destination route.
  const projectActiveRoute = project ? `/app/projects/${project.permalink}` : "";
  const projectCrumbs: BreadcrumbItem[] = [{ id: "/app/projects", label: "Projects" }];
  if (project?.goal) projectCrumbs.push({ id: `/app/goals/${project.goal.permalink}`, label: project.goal.name });
  if (project) projectCrumbs.push({ id: projectActiveRoute, label: project.name || "Project" });

  const handleCrumbSelect = (dest: string) => {
    if (dest !== projectActiveRoute) navigate(dest);
  };

  return (
    <div className="aa-project">
      {project ? (
        <Breadcrumb
          items={projectCrumbs}
          active={projectActiveRoute}
          onSelect={handleCrumbSelect}
        />
      ) : (
        <Link className="aa-task-back" to="/app/projects">
          ← Projects
        </Link>
      )}

      {isLoading && <p className="aa-task-state">Loading…</p>}

      {error && (
        <div className="aa-task-state aa-task-err">
          Couldn't load this project.
        </div>
      )}

      {project && (
        <>
          <header className="aa-project__header">
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
                {/* Identity rail — violet is project/goal identity, never the CTA. */}
                <div className="aa-project__rail">
                  <span className="aa-project__rail-dot" aria-hidden="true" />
                  Project
                </div>
                <h1 className="aa-project__title">{project.name}</h1>
                {project.description && (
                  <p className="aa-project__desc">{project.description}</p>
                )}

                {/* WHY — the goal is the project's reason for existing. Its own
                    line, not tucked into the eyebrow. The name links to the goal
                    detail page; a calm control opens the re-link picker (spec §C),
                    where the link can be changed or broken (None / standalone). */}
                <div className="aa-project__why">
                  <span className="aa-project__why-eyebrow">Why</span>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPickingGoal(false)}
                      >
                        Cancel
                      </Button>
                      {relinkError && (
                        <p className="aa-project__inline-err">{relinkError}</p>
                      )}
                    </div>
                  ) : project.goal ? (
                    <div className="aa-project__why-value">
                      <Link
                        to={`/app/goals/${project.goal.permalink}`}
                        className="aa-project__why-link"
                      >
                        {project.goal.name}
                      </Link>
                      <button
                        type="button"
                        className="aa-project__why-edit"
                        onClick={() => setPickingGoal(true)}
                      >
                        Edit goal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="aa-project__why-empty"
                      onClick={() => setPickingGoal(true)}
                    >
                      Link a goal
                      <ArrowRightIcon />
                    </button>
                  )}
                </div>

                {/* Honest progress band — violet fill (project identity), teal due
                    chip (system/state). Hidden when there are no tasks; never
                    fabricates progress. */}
                {(total > 0 || project.dueDate) && (
                  <div className="aa-project__progress">
                    {total > 0 && (
                      <>
                        <div className="aa-project__progress-track">
                          <div
                            className="aa-project__progress-fill"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="aa-project__progress-label">
                          <strong>{doneCount}</strong> of {total} done
                        </span>
                      </>
                    )}
                    {project.dueDate && (
                      <Chip variant="teal" small>
                        {formatRelativeDue(project.dueDate)}
                      </Chip>
                    )}
                  </div>
                )}

                {/* NEXT STEP — only when there is exactly one Today task. The page
                    points at the one thing to do, same loop as the home screen's
                    Do-this (startTask → /app/focus). With 0 or 2+ Today tasks the
                    Today group below carries the load; we don't fabricate a
                    winner from a tie. */}
                {nextStep && (
                  <div className="aa-project__next">
                    <div className="aa-project__next-eyebrow">Next step</div>
                    <h2 className="aa-project__next-title">
                      {nextStep.description}
                    </h2>
                    <div className="aa-project__next-row">
                      <span className="aa-project__next-meta">
                        Today
                        {nextStep.size && (
                          <>
                            <span className="aa-project__next-sep" aria-hidden="true">·</span>
                            {SIZE_DURATION[nextStep.size] ?? nextStep.size}
                          </>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="aa-project__next-skip"
                        onClick={() => void setStatus(nextStep, "UPCOMING")}
                      >
                        Not now
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        className="aa-project__next-do"
                        icon={<ArrowRightIcon />}
                        iconEnd
                        onClick={() => void handleStart(nextStep)}
                      >
                        Start
                      </Button>
                    </div>
                  </div>
                )}

                {/* Calm empty cue — only when nothing is queued for Today but
                    there are Upcoming tasks to promote. Honest, not pushy: we
                    don't fabricate a hero from an Upcoming task (Today is a
                    commitment). The cue names the situation; the horizon
                    controls on each Upcoming row below do the promoting. */}
                {showNoTodayCue && (
                  <p className="aa-project__cue">
                    Nothing queued for today. Promote one from Upcoming below.
                  </p>
                )}

                {/* Action row — borderless. Teal + Add step leads; Edit / Complete
                    are calm; Delete is destructive and lives behind ⋯ so it can't
                    be tapped by accident. */}
                <div className="aa-project__actions">
                  <Button
                    variant="primary"
                    size="sm"
                    className="aa-project__add"
                    icon={<PlusIcon />}
                    onClick={() => setCreating((v) => !v)}
                  >
                    {creating ? "Cancel" : "Add step"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="aa-project__calm"
                    onClick={startEdit}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="aa-project__calm"
                    onClick={handleComplete}
                    title={project.isDone ? "Return to active projects" : "Mark this project done"}
                  >
                    {project.isDone ? "Reopen" : "Complete"}
                  </Button>
                  <div className="aa-project__overflow-wrap">
                    <button
                      type="button"
                      className="aa-project__overflow"
                      aria-label="More actions"
                      aria-expanded={overflowOpen}
                      onClick={() => setOverflowOpen((v) => !v)}
                    >
                      ⋯
                    </button>
                    {overflowOpen && (
                      <div className="aa-project__overflow-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="aa-project__overflow-item aa-project__overflow-item--danger"
                          onClick={() => {
                            setOverflowOpen(false);
                            setConfirmDelete(true);
                          }}
                        >
                          Delete project
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </header>

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
              <div className="aa-list-empty__icon">
                <CompletionCircle size="md" />
              </div>
              <h2 className="aa-list-empty__title">No tasks yet.</h2>
              <p className="aa-list-empty__text">
                Add the first step — a task lands on Upcoming and shows on Next.
              </p>
            </div>
          ) : (
            <div className="aa-grouped">
              {/* Momentum — three small stats computed from the loaded list.
                  Compact by design: the row redesign is the page's main visual,
                  this is just a glance. */}
              <div className="aa-project__momentum" aria-label="Project momentum">
                <div className="aa-project__momentum-stat">
                  <span className="aa-project__momentum-num">{openCount}</span>
                  <span className="aa-project__momentum-label">Open</span>
                </div>
                <div className="aa-project__momentum-stat">
                  <span className="aa-project__momentum-num">{doneThisWeek}</span>
                  <span className="aa-project__momentum-label">Done this week</span>
                </div>
                <div className="aa-project__momentum-stat">
                  <span className="aa-project__momentum-num">{todayOpenCount}</span>
                  <span className="aa-project__momentum-label">Today</span>
                </div>
              </div>
              {groups.map((group) => {
                if (group.items.length === 0) return null;
                // When the single Today task is lifted into the Next-step
                // region, the Today group would be empty / duplicate — skip it.
                if (
                  group.key === "TODAY" &&
                  nextStep &&
                  group.items.every((t) => t.id === nextStep.id)
                ) {
                  return null;
                }
                return (
                  <section key={group.key} className="aa-grouped__group">
                    <h3 className="aa-grouped__heading">
                      {group.label}
                      <span className="aa-grouped__count">
                        {group.items.length}
                      </span>
                    </h3>
                    <ul className="aa-grouped__list">
                      {group.items.map((task) => (
                        <TaskRow
                          key={task.id}
                          className="aa-grouped__item aa-project__row"
                          task={task}
                          muted={task.status === "SOMEDAY" || task.isDone}
                          onOpen={() =>
                            navigate(`/app/tasks/${task.permalink ?? task.id}`)
                          }
                        >
                          {!task.isDone && (
                            <div className="aa-project__horizon">
                              {task.status !== "TODAY" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="aa-project__row-ctrl"
                                  onClick={() =>
                                    setStatus(
                                      task,
                                      task.status === "SOMEDAY"
                                        ? "UPCOMING"
                                        : "TODAY",
                                    )
                                  }
                                >
                                  {task.status === "SOMEDAY"
                                    ? "Upcoming"
                                    : "Today"}
                                </Button>
                              )}
                              {task.status === "TODAY" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="aa-project__row-ctrl"
                                  onClick={() => setStatus(task, "UPCOMING")}
                                >
                                  Not today
                                </Button>
                              )}
                              {/* §C "move to project" affordance — opens an inline
                                  picker scoped to the project's Lens. */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="aa-project__row-ctrl"
                                onClick={() => {
                                  setMovingTaskId((cur) =>
                                    cur === task.id ? null : task.id,
                                  );
                                  setMoveError(null);
                                }}
                                aria-expanded={movingTaskId === task.id}
                                aria-label={`Move ${task.description} to another project`}
                              >
                                Move
                              </Button>
                            </div>
                          )}
                          {/* Edit — opens the task's own page (title + notes
                              editable there today; full-field editing is
                              pending on the destination). Surfaced on every row
                              including done ones, so a completed task is still
                              reachable. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="aa-project__row-ctrl"
                            onClick={() =>
                              navigate(`/app/tasks/${task.permalink ?? task.id}`)
                            }
                            aria-label={`Edit ${task.description}`}
                          >
                            Edit
                          </Button>
                          {movingTaskId === task.id && (
                            <div className="aa-project__move-picker">
                              <span className="aa-project__move-hint">
                                Move to:
                              </span>
                              {/* Unlink to standalone (keep any goal link). */}
                              <button
                                type="button"
                                className="aa-project__relink-opt"
                                onClick={() =>
                                  void handleMoveTask(task.id, null)
                                }
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
                                  onClick={() =>
                                    void handleMoveTask(task.id, p.id)
                                  }
                                >
                                  {p.name}
                                </button>
                              ))}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMovingTaskId(null)}
                              >
                                Cancel
                              </Button>
                              {moveError && (
                                <p className="aa-project__inline-err">
                                  {moveError}
                                </p>
                              )}
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
        <p className="aa-task-state">
          This project doesn't exist — or isn't yours.
        </p>
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
