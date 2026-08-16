import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getProject,
  getGoals,
  getProjects,
  createTask,
  updateTaskStatus,
  startTask,
  setProjectDone,
  archiveProject,
  moveProject,
  updateProject,
  deleteProject,
  updateTask,
  createResource,
  updateResource,
  deleteResource,
} from "wasp/client/operations";
import { Breadcrumb } from "../components/ui";
import type { BreadcrumbItem } from "../components/ui";
import { AttachmentThumbs } from "../components/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Chip,
  TaskRow,
  CompletionCircle,
  ConfirmDialog,
  BottomSheet,
  PickerSheet,
  InlineEntityEditForm,
  OverflowMenu,
  useMediaQuery,
  PlusIcon,
  ArrowRightIcon,
  type TaskRowTask,
} from "../components/ui";
import { CreateInline } from "../lists/CreateInline";
import type { GroupDef } from "../components/ui";
import { formatRelativeDue } from "../shared/dateFormat";
import { getLenses } from "wasp/client/operations";
import "./ProjectDetailPage.css";

type ProjectTask = TaskRowTask & {
  status: "TODAY" | "UPCOMING" | "SOMEDAY" | "WONT_DO";
  completedAt: Date | string | null;
};

/** Size → human duration, matching the home screen (focusTaskView.sizeLabel). */
const SIZE_DURATION: Record<string, string> = {
  S: "15 min",
  M: "30 min",
  L: "1 hr",
  XL: "2 hr+",
};

type ProjectResource = {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  createdAt: Date | string;
};

type GoalOption = { id: string; permalink: string; name: string };
type ProjectOption = { id: string; permalink: string; name: string };
type LensOption = {
  id: string;
  name: string;
  color: string | null;
  type: "LIFE_AREA" | "SIMPLE_LIST";
};

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
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const {
    data: project,
    isLoading,
    error,
  } = useQuery(getProject, { id: permalink! });
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Action-bar density: mobile tucks Edit into the ⋯ sheet along with the
  // rest of the lifecycle; desktop keeps Edit visible next to Add task.
  const isMobile = useMediaQuery("(max-width: 720px)");

  // Header affordances: edit, re-link picker, confirm-delete.
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [movingProject, setMovingProject] = useState(false);
  const [moveProjectError, setMoveProjectError] = useState<string | null>(null);
  const [deleteTargetProjectId, setDeleteTargetProjectId] = useState("");
  const [relinkError, setRelinkError] = useState<string | null>(null);
  const [resourceEditor, setResourceEditor] = useState<
    ProjectResource | "new" | null
  >(null);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceNotes, setResourceNotes] = useState("");
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceToDelete, setResourceToDelete] =
    useState<ProjectResource | null>(null);
  const targetResourceId = location.hash.startsWith("#resource-")
    ? location.hash.slice("#resource-".length)
    : null;

  useEffect(() => {
    if (
      !targetResourceId ||
      !project?.resources.some(
        (resource: ProjectResource) => resource.id === targetResourceId,
      )
    )
      return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`resource-${targetResourceId}`)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [project, targetResourceId]);

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
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const { data: lensProjects } = useQuery(
    getProjects,
    project ? { lensId: project.lensId } : undefined,
    { enabled: !!project && (movingTaskId !== null || confirmDelete) },
  );
  const { data: allLenses } = useQuery(getLenses, undefined, {
    enabled: movingProject,
  });
  const projectMoveTargets: LensOption[] = (allLenses ?? []).filter(
    (lens: LensOption) =>
      lens.type === "LIFE_AREA" && lens.id !== project?.lensId,
  );
  // Siblings only — a task can't move to the project it's already in.
  const moveTargets: ProjectOption[] = (lensProjects ?? []).filter(
    (p: ProjectOption) => p.id !== project?.id,
  );

  // Declined (WONT_DO) tasks have left the project's active surface — they
  // live in the Logbook until restored there. Exclude them before grouping or
  // counting so declining a task (from its detail page) visibly removes it
  // here, same as every other list.
  const activeTasks = useMemo(
    () => (project?.tasks ?? []).filter((t) => t.status !== "WONT_DO"),
    [project],
  );

  // Group the project's tasks by horizon. Open tasks split into Today / Upcoming
  // / Someday; done ones collect at the bottom.
  const groups = useMemo<GroupDef<ProjectTask>[]>(() => {
    const buckets: Record<string, ProjectTask[]> = {
      TODAY: [],
      UPCOMING: [],
      SOMEDAY: [],
      DONE: [],
    };
    for (const t of activeTasks) {
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
  }, [activeTasks]);

  const doneCount = activeTasks.filter((t) => t.isDone).length;
  const total = activeTasks.length;
  const progressPct =
    project && total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Momentum header stats — Open, Done this week, Today. Computed from the
  // already-loaded task list (no extra query). "This week" = last 7 days,
  // measured from completedAt (set when a task is marked done).
  const openCount = total - doneCount;
  const todayOpenCount = activeTasks.filter(
    (t) => !t.isDone && t.status === "TODAY",
  ).length;
  const doneThisWeek = activeTasks.filter((t) => {
    if (!t.isDone || !t.completedAt) return false;
    const ageMs = Date.now() - new Date(t.completedAt).getTime();
    return ageMs <= 7 * 86_400_000;
  }).length;

  // Next-step candidate: the first Today task. A project can have more than
  // one task scheduled for today, but that should never hide the way to begin:
  // start the first one right from this page and leave the remaining tasks in
  // the Today group below.
  const todayTasks = useMemo(
    () => activeTasks.filter((t) => !t.isDone && t.status === "TODAY"),
    [activeTasks],
  );
  const nextStep = todayTasks[0] ?? null;

  // "Nothing queued for today" cue — shown only when there are zero open Today
  // tasks AND at least one open Upcoming task to promote. Today is a commitment
  // in this app (WORKFLOW §2.2), so we never auto-pull an Upcoming task into a
  // hero; the cue just names the situation and points at the rows below.
  const hasUpcoming = useMemo(
    () => activeTasks.some((t) => !t.isDone && t.status === "UPCOMING"),
    [activeTasks],
  );
  const showNoTodayCue = !nextStep && todayTasks.length === 0 && hasUpcoming;

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
  // invalidations, same /do/focus navigation — so the project page's Do-this
  // is the same loop as the home screen's.
  const handleStart = async (task: ProjectTask) => {
    await startTask({ id: task.id });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
    queryClient.invalidateQueries({ queryKey: ["getProject"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    navigate("/do/focus");
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
    if (!project.isDone) navigate("/do/projects");
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

  const handleDelete = async (
    taskDisposition: "delete" | "reassign" | "triage" = "delete",
  ) => {
    if (!project) return;
    const input: {
      id: string;
      taskDisposition: "delete" | "reassign" | "triage";
      targetProjectId?: string;
    } = { id: project.id, taskDisposition };
    if (taskDisposition === "reassign")
      input.targetProjectId = deleteTargetProjectId;
    await deleteProject(input);
    queryClient.invalidateQueries({ queryKey: ["getProjects"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getGoals"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    setConfirmDelete(false);
    navigate("/do/projects");
  };

  const handleArchive = async () => {
    if (!project) return;
    await archiveProject({ id: project.id });
    queryClient.invalidateQueries({ queryKey: ["getProjects"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    setConfirmArchive(false);
    navigate("/do/projects");
  };

  const handleMoveProject = async (targetLensId: string) => {
    if (!project) return;
    setMoveProjectError(null);
    try {
      await moveProject({ id: project.id, targetLensId });
      queryClient.invalidateQueries({ queryKey: ["getProject"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getLenses"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setMovingProject(false);
    } catch (e) {
      setMoveProjectError(
        e instanceof Error ? e.message : "Couldn't move the project.",
      );
    }
  };

  const openResourceEditor = (resource: ProjectResource | "new") => {
    setResourceEditor(resource);
    setResourceTitle(resource === "new" ? "" : resource.title);
    setResourceUrl(resource === "new" ? "" : (resource.url ?? ""));
    setResourceNotes(resource === "new" ? "" : (resource.notes ?? ""));
    setResourceError(null);
  };

  const saveResource = async () => {
    if (!project || !resourceEditor) return;
    setResourceSaving(true);
    setResourceError(null);
    try {
      if (resourceEditor === "new") {
        await createResource({
          projectId: project.id,
          title: resourceTitle,
          url: resourceUrl,
          notes: resourceNotes,
        });
      } else {
        await updateResource({
          id: resourceEditor.id,
          title: resourceTitle,
          url: resourceUrl,
          notes: resourceNotes,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["getProject"] });
      setResourceEditor(null);
    } catch (e) {
      setResourceError(
        e instanceof Error ? e.message : "Couldn't save resource.",
      );
    } finally {
      setResourceSaving(false);
    }
  };

  const removeResource = async () => {
    if (!resourceToDelete) return;
    await deleteResource({ id: resourceToDelete.id });
    queryClient.invalidateQueries({ queryKey: ["getProject"] });
    setResourceToDelete(null);
  };

  // Breadcrumb chain: Goal › Project. A "Projects" list root is always present
  // so there's always a way back to /do/projects even when the project has no
  // goal ancestor. Crumb id IS the destination route.
  const projectActiveRoute = project ? `/do/projects/${project.permalink}` : "";
  const projectCrumbs: BreadcrumbItem[] = [
    { id: "/do/projects", label: "Projects" },
  ];
  if (project?.goal)
    projectCrumbs.push({
      id: `/do/goals/${project.goal.permalink}`,
      label: project.goal.name,
    });
  if (project)
    projectCrumbs.push({
      id: projectActiveRoute,
      label: project.name || "Project",
    });

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
        <Link className="aa-task-back" to="/do/projects">
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
                {/* Captured images carried onto the project by triage
                    (ProjectAttachment) — display-only, same thumbs + lightbox
                    as everywhere else. Sits with the identity it belongs to. */}
                {(project.attachments?.length ?? 0) > 0 && (
                  <div className="aa-project__attachments">
                    <AttachmentThumbs attachments={project.attachments} size="md" />
                  </div>
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
                        to={`/do/goals/${project.goal.permalink}`}
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

                {/* NEXT STEP — whenever the project has a Today task. The page
                    always provides an immediate way to begin, using the same
                    loop as the home screen (startTask → /do/focus). Other
                    Today tasks remain available in the group below. */}
                {!project.isDone && nextStep && (
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
                            <span
                              className="aa-project__next-sep"
                              aria-hidden="true"
                            >
                              ·
                            </span>
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
                {!project.isDone && showNoTodayCue && (
                  <p className="aa-project__cue">
                    Nothing queued for today. Promote one from Upcoming below.
                  </p>
                )}

                {/* Action row — borderless. Teal + Add task leads, with Edit
                    beside it on desktop (Edit joins the menu on mobile). The
                    remaining lifecycle actions tuck behind ⋯ — popover on
                    desktop, bottom sheet on mobile — with Delete last. */}
                <div className="aa-project__actions">
                  {!project.isDone && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="aa-project__add"
                      icon={<PlusIcon />}
                      onClick={() => setCreating((v) => !v)}
                    >
                      {creating ? "Cancel" : "Add task"}
                    </Button>
                  )}
                  {!isMobile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="aa-project__calm"
                      onClick={startEdit}
                    >
                      Edit
                    </Button>
                  )}
                  <OverflowMenu
                    label="Project actions"
                    items={[
                      ...(isMobile
                        ? [{ label: "Edit", onPick: startEdit }]
                        : []),
                      { label: "Move", onPick: () => setMovingProject(true) },
                      // Archived projects hide Complete/Reopen and Archive —
                      // their lifecycle is settled until unarchived elsewhere.
                      ...(!project.archivedAt
                        ? [
                            {
                              label: project.isDone ? "Reopen" : "Complete",
                              onPick: () => {
                                if (project.isDone) void handleComplete();
                                else setConfirmComplete(true);
                              },
                              title: project.isDone
                                ? "Return to active projects"
                                : "Mark this project done",
                            },
                            {
                              label: "Archive",
                              onPick: () => setConfirmArchive(true),
                            },
                          ]
                        : []),
                      {
                        label: "Delete",
                        onPick: () => setConfirmDelete(true),
                        danger: true,
                      },
                    ]}
                  />
                </div>
              </>
            )}
          </header>

          {creating && !project.isDone && (
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
              <div
                className="aa-project__momentum"
                aria-label="Project momentum"
              >
                <div className="aa-project__momentum-stat">
                  <span className="aa-project__momentum-num">{openCount}</span>
                  <span className="aa-project__momentum-label">Open</span>
                </div>
                <div className="aa-project__momentum-stat">
                  <span className="aa-project__momentum-num">
                    {doneThisWeek}
                  </span>
                  <span className="aa-project__momentum-label">
                    Done this week
                  </span>
                </div>
                <div className="aa-project__momentum-stat">
                  <span className="aa-project__momentum-num">
                    {todayOpenCount}
                  </span>
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
                const isDoneGroup = group.key === "DONE";
                return (
                  <section
                    key={group.key}
                    className={`aa-grouped__group${isDoneGroup ? " aa-project__done-group" : ""}`}
                  >
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
                          className={`aa-grouped__item aa-project__row${activeTaskId === task.id ? " aa-project__row--active" : ""}`}
                          // Completion settles a task. Its prior estimate and
                          // deadline no longer help someone scan this project;
                          // leaving the size chip behind made mobile done rows
                          // look like unfinished work.
                          task={
                            task.isDone
                              ? { ...task, size: undefined, dueDate: null }
                              : task
                          }
                          muted={task.status === "SOMEDAY" || task.isDone}
                          expanded={
                            task.isDone ? undefined : activeTaskId === task.id
                          }
                          onOpen={() => {
                            if (task.isDone) {
                              navigate(
                                `/do/tasks/${task.permalink ?? task.id}`,
                                {
                                  state: { returnTo },
                                },
                              );
                              return;
                            }
                            setActiveTaskId((current) =>
                              current === task.id ? null : task.id,
                            );
                          }}
                        >
                          {!task.isDone ? (
                            <>
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
                              {/* Edit takes open tasks to their full task editor.
                                Done tasks are review-only; tapping their row
                                opens the actual task detail instead. */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="aa-project__row-ctrl"
                                onClick={() =>
                                  navigate(
                                    `/do/tasks/${task.permalink ?? task.id}`,
                                    {
                                      state: { returnTo },
                                    },
                                  )
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
                            </>
                          ) : null}
                        </TaskRow>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          <section
            className="aa-project__resources"
            aria-labelledby="project-resources-heading"
          >
            <div className="aa-project__resources-head">
              <h2
                id="project-resources-heading"
                className="aa-project__resources-title"
              >
                Resources
              </h2>
              <Button
                variant="primary"
                size="sm"
                className="aa-project__add"
                icon={<PlusIcon />}
                onClick={() => openResourceEditor("new")}
              >
                Add resource
              </Button>
              <p className="aa-project__resources-copy">
                Links, notes, and reference material for this project.
              </p>
            </div>
            {project.resources.length === 0 ? (
              <p className="aa-project__resources-empty">
                Nothing saved here yet.
              </p>
            ) : (
              <ul className="aa-project__resources-list">
                {project.resources.map((resource: ProjectResource) => (
                  <li
                    id={`resource-${resource.id}`}
                    key={resource.id}
                    className={`aa-project__resource${resource.id === targetResourceId ? " is-search-target" : ""}`}
                  >
                    <div className="aa-project__resource-main">
                      {resource.url ? (
                        <a
                          className="aa-project__resource-link"
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span aria-hidden="true">↗</span> {resource.title}
                        </a>
                      ) : (
                        <span className="aa-project__resource-title">
                          {resource.title}
                        </span>
                      )}
                      {resource.notes && (
                        <p className="aa-project__resource-notes">
                          {resource.notes}
                        </p>
                      )}
                    </div>
                    <div className="aa-project__resource-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openResourceEditor(resource)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setResourceToDelete(resource)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!isLoading && !error && !project && (
        <p className="aa-task-state">
          This project doesn't exist — or isn't yours.
        </p>
      )}

      {confirmComplete && project && (
        <ConfirmDialog
          title="Complete this project?"
          message="It will stay in your completed projects list, where you can edit, archive, or delete it. Its tasks will not change."
          confirmLabel="Complete project"
          onConfirm={() => {
            setConfirmComplete(false);
            void handleComplete();
          }}
          onClose={() => setConfirmComplete(false)}
        />
      )}

      {confirmArchive && project && (
        <ConfirmDialog
          title="Archive this project?"
          message="This will complete the project and hide it from your Projects and Logbook. Its task history will be kept."
          confirmLabel="Archive project"
          onConfirm={() => void handleArchive()}
          onClose={() => setConfirmArchive(false)}
        />
      )}

      {movingProject && project && (
        <PickerSheet
          title="Move project to another Lens"
          items={projectMoveTargets.map((lens) => ({
            id: lens.id,
            label: lens.name,
            meta: "Life area",
            chip: { label: lens.name, color: lens.color },
          }))}
          emptyMessage="There are no other Life-area Lenses to move this project to."
          onPick={(lensId) => void handleMoveProject(lensId)}
          onClose={() => setMovingProject(false)}
        />
      )}
      {moveProjectError && (
        <ConfirmDialog
          title="Couldn't move project"
          message={moveProjectError}
          confirmLabel="Got it"
          cancelLabel={null}
          onConfirm={() => setMoveProjectError(null)}
          onClose={() => setMoveProjectError(null)}
        />
      )}

      {confirmDelete && project && total === 0 && (
        <ConfirmDialog
          title="Delete this project?"
          message="This project will be removed. No tasks are in it."
          confirmLabel="Delete project"
          danger
          onConfirm={() => void handleDelete()}
          onClose={() => setConfirmDelete(false)}
        />
      )}

      {confirmDelete && project && total > 0 && (
        <BottomSheet
          title="What should happen to these tasks?"
          onClose={() => setConfirmDelete(false)}
        >
          <div className="aa-project__delete-options">
            <p>
              {total} {total === 1 ? "task is" : "tasks are"} still in “
              {project.name}”.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void handleDelete("delete")}
            >
              Remove tasks and delete project
            </Button>
            <div className="aa-project__delete-reassign">
              <label htmlFor="project-delete-target">Move tasks to</label>
              <select
                id="project-delete-target"
                value={deleteTargetProjectId}
                onChange={(event) =>
                  setDeleteTargetProjectId(event.target.value)
                }
              >
                <option value="">Choose a project</option>
                {moveTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={!deleteTargetProjectId}
                onClick={() => void handleDelete("reassign")}
              >
                Move tasks and delete project
              </Button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleDelete("triage")}
            >
              Send tasks to Triage and delete project
            </Button>
          </div>
        </BottomSheet>
      )}

      {resourceEditor && (
        <BottomSheet
          title={resourceEditor === "new" ? "Add resource" : "Edit resource"}
          onClose={() => setResourceEditor(null)}
        >
          <form
            className="aa-project__resource-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveResource();
            }}
          >
            <label>
              Title
              <input
                autoFocus
                value={resourceTitle}
                onChange={(e) => setResourceTitle(e.target.value)}
                placeholder="What is this?"
              />
            </label>
            <label>
              Link <span>(optional)</span>
              <input
                value={resourceUrl}
                onChange={(e) => setResourceUrl(e.target.value)}
                placeholder="https://…"
                type="url"
              />
            </label>
            <label>
              Notes <span>(optional)</span>
              <textarea
                value={resourceNotes}
                onChange={(e) => setResourceNotes(e.target.value)}
                placeholder="Why keep this?"
                rows={4}
              />
            </label>
            {resourceError && (
              <p className="aa-project__resource-error">{resourceError}</p>
            )}
            <div className="aa-project__resource-form-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setResourceEditor(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={resourceSaving}>
                {resourceSaving ? "Saving…" : "Save resource"}
              </Button>
            </div>
          </form>
        </BottomSheet>
      )}

      {resourceToDelete && (
        <ConfirmDialog
          title="Remove this resource?"
          message={
            <>
              “{resourceToDelete.title}” will be removed from this project.
              Tasks and their Context links stay unchanged.
            </>
          }
          confirmLabel="Remove resource"
          danger
          onConfirm={() => void removeResource()}
          onClose={() => setResourceToDelete(null)}
        />
      )}
    </div>
  );
}
