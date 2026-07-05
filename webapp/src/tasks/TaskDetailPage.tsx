import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  useQuery,
  getTask,
  getProjects,
  getGoals,
  submitFeedback,
  updateTaskDetails,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import {
  TaskChipEditor,
  type TaskChipProject,
  type TaskChipGoal,
  type TaskChipState,
  type TaskPriority,
  type TaskSize,
  type TaskStatus,
} from "./TaskChipEditor";
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

  // Live-edit a structural field via a chip pick. Writes immediately; the
  // optimistic state is the server response, so we invalidate rather than
  // patch locally. Errors surface inline on the page.
  const [chipError, setChipError] = useState<string | null>(null);
  const handleChipChange = async (
    patch: Omit<
      Partial<TaskChipState>,
      "project" | "goal" | "dueDate"
    > & {
      projectId?: string | null;
      goalId?: string | null;
      dueDate?: Date | null;
    },
  ) => {
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

  const canSendFeedback =
    feedbackMessage.trim().length > 0 && !feedbackSubmitting;

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

  return (
    <div className="aa-task-edit">
      <header className="aa-task-edit__topbar">
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
            <TaskChipEditor
              task={{
                status: (task.status as TaskStatus) ?? "UPCOMING",
                priority: (task.priority as TaskPriority) ?? "NORMAL",
                size: (task.size as TaskSize) ?? "M",
                dueDate: task.dueDate,
                project: (task.project as TaskChipProject | null) ?? null,
                goal: (task.goal as TaskChipGoal | null) ?? null,
              }}
              projects={(lensProjects ?? []).map((p: { id: string; name: string; goal?: { name: string } | null }) => ({
                id: p.id,
                label: p.name,
                meta: p.goal?.name ?? null,
              }))}
              goals={(lensGoals ?? []).map((g: { id: string; name: string }) => ({
                id: g.id,
                label: g.name,
              }))}
              readOnly={task.isDone}
              onChange={(patch) => void handleChipChange(patch)}
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
                  <p>{content}</p>
                </div>
              )}
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
