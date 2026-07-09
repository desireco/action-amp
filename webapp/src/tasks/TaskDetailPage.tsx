import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  useQuery,
  getTask,
  getProjects,
  getGoals,
  submitFeedback,
  setTaskOutcome,
  updateTaskDetails,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Breadcrumb, Button, Markdown, PropertyChips, submitOnModEnter } from "../components/ui";
import type { BreadcrumbItem } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { usePropertyKeys } from "../components/ui/usePropertyKeys";
import {
  taskPropertyFields,
  chipPickToTaskPatch,
  type TaskChipGoal,
  type TaskChipProject,
  type TaskChipState,
  type TaskPriority,
  type TaskSize,
  type TaskStatus,
} from "./taskPropertyFields";
import "./TaskDetailPage.css";

/**
 * Task detail — the dedicated URL for a single Task.
 *
 * The page reads as a task, not a settings form. Under the title sits a row of
 * chips (When / Priority / Size / Project / Due / Goal) — each chip IS the
 * editor for that property. Click a chip, a small popover opens with just that
 * property's options; pick one and it saves instantly (live). Title and notes
 * stay on the working-copy + Save footer (you don't want a write per
 * keystroke). Done tasks render read-only.
 *
 * Project / Goal chips open a bottom sheet (PickerSheet) since those lists are
 * data-driven (the lens's projects / goals).
 */
export function TaskDetailPage() {
  const lens = useActiveLens();
  const { permalink } = useParams<{ permalink: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: task,
    isLoading,
    error,
  } = useQuery(getTask, {
    id: permalink!,
  });

  // Buffered prose: title + notes sit in local state, written by the Save
  // footer. Structural fields don't touch this — they live-edit directly.
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  // Outcome (task-fields §E/§F): editable on done tasks, written through its
  // own op (setTaskOutcome) since it's separate from the title+notes Save.
  const [outcomeDraft, setOutcomeDraft] = useState("");
  const [outcomeEditing, setOutcomeEditing] = useState(false);
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const state = location.state as { returnTo?: unknown } | null;
  const returnTo =
    typeof state?.returnTo === "string" && state.returnTo.startsWith("/app")
      ? state.returnTo
      : "/app";

  useEffect(() => {
    if (!task) return;
    setDescription(task.description);
    setContent(task.content ?? "");
    setOutcomeDraft(task.outcome ?? "");
    setOutcomeEditing(false);
    setSaveError(null);
  }, [task]);

  // Lens projects / goals for the bottom-sheet pickers. Only fetched when the
  // task is loaded and not done (done tasks have no editors).
  const lensId = task?.lensId;
  const { data: lensProjects } = useQuery(
    getProjects,
    lensId ? { lensId } : undefined,
    { enabled: !!lensId && !task?.isDone },
  );
  const { data: lensGoals } = useQuery(
    getGoals,
    lensId ? { lensId } : undefined,
    { enabled: !!lensId && !task?.isDone },
  );

  const canSave =
    Boolean(task) &&
    !task!.isDone &&
    description.trim().length > 0 &&
    !saving &&
    (description.trim() !== task!.description ||
      content.trim() !== (task!.content ?? ""));

  const saveTask = async () => {
    if (!task || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateTaskDetails({
        taskId: task.id,
        description,
        content,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getTask"] }),
        queryClient.invalidateQueries({ queryKey: ["getTasks"] }),
        queryClient.invalidateQueries({ queryKey: ["getDoneToday"] }),
        queryClient.invalidateQueries({ queryKey: ["getTopTask"] }),
        queryClient.invalidateQueries({ queryKey: ["getProjects"] }),
        queryClient.invalidateQueries({ queryKey: ["getProject"] }),
      ]);
      navigate(returnTo);
    } catch {
      setSaveError("Could not save task.");
    } finally {
      setSaving(false);
    }
  };

  // Live-edit a structural field. Chip picks (When/Priority/Size/Due) arrive
  // here via PropertyChips' onPick; picker picks (Project/Goal) via
  // onPickerPick. Both write immediately through updateTaskDetails. The same
  // write path is used by the property-key shortcuts (usePropertyKeys below).
  const [chipError, setChipError] = useState<string | null>(null);
  // Tracks whether any chip popover / picker sheet is open — the property-key
  // shortcuts disable themselves while one is (you can't cycle size with "]"
  // while the size popover is open).
  const [chipOpen, setChipOpen] = useState(false);

  // The set of structural fields we can live-edit. Omit taskId (added below).
  type TaskPatch = Omit<
    Parameters<typeof updateTaskDetails>[0],
    "taskId"
  >;

  const writeTaskPatch = async (patch: TaskPatch) => {
    if (!task) return;
    setChipError(null);
    try {
      await updateTaskDetails({ taskId: task.id, ...patch });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getTask"] }),
        queryClient.invalidateQueries({ queryKey: ["getTasks"] }),
        queryClient.invalidateQueries({ queryKey: ["getTopTask"] }),
        queryClient.invalidateQueries({ queryKey: ["getProjects"] }),
        queryClient.invalidateQueries({ queryKey: ["getProject"] }),
        queryClient.invalidateQueries({ queryKey: ["getGoals"] }),
        queryClient.invalidateQueries({ queryKey: ["getAppData"] }),
      ]);
    } catch {
      setChipError("Couldn't update that. Try again.");
    }
  };

  // Inline popover pick — When/Priority/Size/Due.
  const handlePick = (fieldKey: string, value: string): void => {
    const patch = chipPickToTaskPatch(fieldKey, value);
    if (Object.keys(patch).length === 0) return;
    void writeTaskPatch(patch as TaskPatch);
  };
  // Bottom-sheet pick — Project/Goal. value is an id, or null for "None".
  const handlePickerPick = (fieldKey: string, value: string | null): void => {
    if (fieldKey === "project") void writeTaskPatch({ projectId: value });
    else if (fieldKey === "goal") void writeTaskPatch({ goalId: value });
  };

  // Property-key shortcuts (TRIAGE.md §7.4/§7.6): [ / ] = size, - / = =
  // priority, H = cycle When. Same scheme as triage; disabled while a chip
  // popover/sheet is open OR the title/notes inputs are focused OR the task is
  // done. The hook guards typing targets itself. The hook is intentionally
  // string-typed (it serves triage + task page); cast to the op's enums here.
  usePropertyKeys({
    enabled: !!task && !task.isDone && !chipOpen,
    get: () => ({
      status: (task?.status as TaskStatus) ?? "UPCOMING",
      priority: (task?.priority as TaskPriority) ?? "NORMAL",
      size: (task?.size as TaskSize) ?? "M",
    }),
    set: (patch) =>
      void writeTaskPatch({
        status: patch.status as TaskStatus | undefined,
        priority: patch.priority as TaskPriority | undefined,
        size: patch.size as TaskSize | undefined,
      }),
  });

  const canSendFeedback =
    feedbackMessage.trim().length > 0 && !feedbackSubmitting;

  // Persist the Outcome note via its own op (separate from the title+notes
  // Save). Writable on done tasks so a note captured — or skipped — at
  // completion can be added or revised afterwards (task-fields §F).
  const saveOutcome = async () => {
    if (!task || outcomeSaving) return;
    setOutcomeSaving(true);
    try {
      await setTaskOutcome({ taskId: task.id, outcome: outcomeDraft });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["getTask"] }),
        queryClient.invalidateQueries({ queryKey: ["getLogbook"] }),
        queryClient.invalidateQueries({ queryKey: ["getDoneToday"] }),
      ]);
      setOutcomeEditing(false);
    } catch {
      setSaveError("Could not save outcome.");
    } finally {
      setOutcomeSaving(false);
    }
  };

  const sendFeedback = async () => {
    if (!task || !canSendFeedback) return;
    setFeedbackSubmitting(true);
    setFeedbackError(null);
    try {
      await submitFeedback({
        message: `Done task feedback: ${task.description}\n\n${feedbackMessage.trim()}`,
        route: location.pathname,
        section: "work",
        lens: lens ? { id: lens.id, name: lens.name, color: lens.color } : null,
        userAgent:
          typeof navigator === "undefined" ? null : navigator.userAgent,
      });
      setFeedbackMessage("");
    } catch {
      setFeedbackError("Could not send feedback. Try again.");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const createdLabel = task
    ? new Date(task.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  // Build the breadcrumb chain from the task's ancestors (skipping nulls).
  // Route model: each crumb navigates to the ancestor's detail route.
  const taskCrumbs: BreadcrumbItem[] = [];
  if (task?.goal) taskCrumbs.push({ id: `goal:${task.goal.permalink}`, label: task.goal.name });
  if (task?.project) taskCrumbs.push({ id: `project:${task.project.permalink}`, label: task.project.name });
  const taskActiveId = task ? `task:${task.permalink}` : "";
  if (task) taskCrumbs.push({ id: taskActiveId, label: task.description || "Task" });

  const handleCrumbSelect = (crumbId: string) => {
    const [kind, permalink] = crumbId.split(":");
    if (kind === "goal") navigate(`/app/goals/${permalink}`);
    else if (kind === "project") navigate(`/app/projects/${permalink}`);
    // "task" is the current page — no-op (already here).
  };

  return (
    <div className="aa-task-edit">
      <header className="aa-task-edit__topbar">
        {taskCrumbs.length > 0 ? (
          <Breadcrumb
            items={taskCrumbs}
            active={taskActiveId}
            onSelect={handleCrumbSelect}
          />
        ) : (
          <a
            href={returnTo}
            className="aa-task-edit__back"
            onClick={(e) => {
              e.preventDefault();
              navigate(returnTo);
            }}
          >
            ← Back
          </a>
        )}
        {task && (
          <span className="aa-task-edit__permalink">
            /tasks/{task.permalink}
          </span>
        )}
      </header>

      {isLoading && <p className="aa-task-edit__state">Loading…</p>}

      {error && (
        <div className="aa-task-edit__state aa-task-edit__err">
          Couldn't load this task.
        </div>
      )}

      {task && (
        <div className="aa-task-edit__form">
          <section className="aa-task-edit__hero" aria-labelledby="task-title">
            <div className="aa-task-edit__kicker">
              <span>{task.isDone ? "Done task" : "Edit task"}</span>
              <span>Added {createdLabel}</span>
            </div>
            {task.isDone ? (
              <h1 id="task-title" className="aa-task-readonly-title">
                {task.description}
              </h1>
            ) : (
              <input
                id="task-title"
                className="aa-task-input"
                aria-label="Task title"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}

            {/* The chip row IS the editor for every structural field. */}
            <PropertyChips
              fields={taskPropertyFields({
                task: {
                  status: (task.status as TaskStatus) ?? "UPCOMING",
                  priority: (task.priority as TaskPriority) ?? "NORMAL",
                  size: (task.size as TaskSize) ?? "M",
                  dueDate: task.dueDate,
                  project: (task.project as TaskChipProject | null) ?? null,
                  goal: (task.goal as TaskChipGoal | null) ?? null,
                },
                projects: (lensProjects ?? []).map(
                  (p: { id: string; name: string; goal?: { name: string } | null }) => ({
                    id: p.id,
                    label: p.name,
                    meta: p.goal?.name ?? null,
                  }),
                ),
                goals: (lensGoals ?? []).map((g: { id: string; name: string }) => ({
                  id: g.id,
                  label: g.name,
                })),
              })}
              readOnly={task.isDone}
              onPick={handlePick}
              onPickerPick={handlePickerPick}
              onOpenChange={setChipOpen}
            />
            {chipError && !task.isDone && (
              <p className="aa-task-edit__err">{chipError}</p>
            )}
          </section>

          {task.isDone ? (
            <section
              className="aa-task-done-panel"
              aria-label="Completed task feedback"
            >
              <p className="aa-task-done-panel__notice">
                Completed tasks are closed; leave feedback about your experience
                doing it.
              </p>
              {content && (
                <div className="aa-task-done-panel__notes">
                  <span className="aa-task-label">Notes</span>
                  <Markdown>{content}</Markdown>
                </div>
              )}
              {/* Outcome — captured at completion, editable here afterwards
                  (task-fields §F). Empty reads as nothing in the Logbook;
                  here we show an explicit (optional) field so it's editable. */}
              <div className="aa-task-done-panel__outcome">
                <div className="aa-task-done-panel__outcome-head">
                  <span className="aa-task-label">Outcome</span>
                  {!outcomeEditing && (
                    <button
                      type="button"
                      className="aa-task-done-panel__outcome-toggle"
                      onClick={() => setOutcomeEditing(true)}
                    >
                      {task.outcome ? "Edit" : "Add outcome"}
                    </button>
                  )}
                </div>
                {outcomeEditing ? (
                  <div className="aa-task-done-panel__outcome-editor">
                    <textarea
                      className="aa-task-textarea"
                      aria-label="Task outcome"
                      value={outcomeDraft}
                      onChange={(e) => setOutcomeDraft(e.target.value)}
                      onKeyDown={(e) => submitOnModEnter(e, () => void saveOutcome())}
                      placeholder="What happened?"
                      rows={4}
                      disabled={outcomeSaving}
                    />
                    <div className="aa-task-done-panel__outcome-actions">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => void saveOutcome()}
                        disabled={outcomeSaving}
                      >
                        {outcomeSaving ? "Saving" : "Save outcome"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setOutcomeDraft(task.outcome ?? "");
                          setOutcomeEditing(false);
                        }}
                        disabled={outcomeSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : task.outcome ? (
                  <Markdown>{task.outcome}</Markdown>
                ) : null}
              </div>
              <div className="aa-task-feedback-inline">
                <label className="aa-task-label" htmlFor="task-feedback">
                  Feedback
                </label>
                <textarea
                  id="task-feedback"
                  className="aa-task-feedback-inline__textarea"
                  rows={5}
                  value={feedbackMessage}
                  onChange={(event) => setFeedbackMessage(event.target.value)}
                  placeholder="What should we know?"
                  maxLength={4000}
                  disabled={feedbackSubmitting}
                />
                {feedbackError && (
                  <p className="aa-task-edit__err">{feedbackError}</p>
                )}
                <div className="aa-task-feedback-inline__footer">
                  <span>{feedbackMessage.length}/4000</span>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      void sendFeedback();
                    }}
                    disabled={!canSendFeedback}
                  >
                    {feedbackSubmitting ? "Sending" : "Send feedback"}
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <section
              className="aa-task-edit__notes"
              aria-labelledby="task-notes"
            >
              <label className="aa-task-label" id="task-notes">
                Notes
              </label>
              <textarea
                className="aa-task-textarea"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Add details, links, or next steps."
              />
            </section>
          )}

          {saveError && <p className="aa-task-edit__err">{saveError}</p>}

          <div className="aa-task-edit__actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(returnTo)}
            >
              {task.isDone ? "Back" : "Cancel"}
            </Button>
            {task.isDone ? null : (
              <Button
                type="button"
                variant="primary"
                disabled={!canSave}
                onClick={() => void saveTask()}
              >
                {saving ? "Saving" : "Save task"}
              </Button>
            )}
          </div>
          {!task.isDone && (
            <p className="aa-task-edit__help">
              Save writes the title and notes. Chips above are live.
            </p>
          )}
        </div>
      )}

      {!isLoading && !error && !task && (
        <p className="aa-task-edit__state">
          This task doesn't exist — or isn't yours.
        </p>
      )}
    </div>
  );
}
