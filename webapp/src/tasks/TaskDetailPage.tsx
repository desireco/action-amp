import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router";
import { useQuery, getTask, updateTaskDetails } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Chip } from "../components/ui";
import "./TaskDetailPage.css";

/**
 * Task detail — the dedicated URL for a single Task (what the focus engine
 * points at). Real entity, real query, user-scoped. The shell is rendered by
 * the root App component, so this page renders only its content.
 *
 * The remaining fields (priority, size, due, notes) arrive when the full Task
 * model lands.
 */
export function TaskDetailPage() {
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
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const canSave =
    Boolean(task) &&
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
      ]);
      navigate(returnTo);
    } catch {
      setSaveError("Could not save task.");
    } finally {
      setSaving(false);
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
        <Link className="aa-task-edit__back" to={returnTo}>
          ← Back
        </Link>
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
        <form
          className="aa-task-edit__form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveTask();
          }}
        >
          <section className="aa-task-edit__hero" aria-labelledby="task-title">
            <div className="aa-task-edit__kicker">
              <span>{task.isDone ? "Done task" : "Edit task"}</span>
              <span>Added {createdLabel}</span>
            </div>
            <input
              id="task-title"
              className="aa-task-input"
              aria-label="Task title"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="aa-task-edit__chips">
              <Chip variant={task.status === "TODAY" ? "teal" : "muted"} small>
                {task.status?.toLowerCase() ?? "task"}
              </Chip>
              <Chip
                variant={task.priority === "IMPORTANT" ? "amber" : "muted"}
                small
              >
                {task.priority?.toLowerCase() ?? "normal"}
              </Chip>
              <Chip variant="muted" small>
                {task.size}
              </Chip>
              {task.project && (
                <Link
                  className="aa-task-edit__context-link"
                  to={`/app/projects/${task.project.permalink}`}
                >
                  {task.project.name}
                </Link>
              )}
              {!task.project && task.goal && (
                <Link
                  className="aa-task-edit__context-link"
                  to={`/app/goals/${task.goal.permalink}`}
                >
                  {task.goal.name}
                </Link>
              )}
            </div>
          </section>

          <section className="aa-task-edit__notes" aria-labelledby="task-notes">
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

          {saveError && <p className="aa-task-edit__err">{saveError}</p>}

          <div className="aa-task-edit__actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(returnTo)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!canSave}>
              {saving ? "Saving" : "Save task"}
            </Button>
          </div>
        </form>
      )}

      {!isLoading && !error && !task && (
        <p className="aa-task-edit__state">
          This task doesn't exist — or isn't yours.
        </p>
      )}
    </div>
  );
}
