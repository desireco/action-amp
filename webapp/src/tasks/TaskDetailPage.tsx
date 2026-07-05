import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery, getTask, updateTaskDetails } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui";
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
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: task, isLoading, error } = useQuery(getTask, { id: id! });
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    } catch {
      setSaveError("Could not save task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="aa-task">
      <Link className="aa-task-back" to="/app">
        ← Next
      </Link>

      {isLoading && <p className="aa-task-state">Loading…</p>}

      {error && (
        <div className="aa-task-state aa-task-err">
          Couldn't load this task.
        </div>
      )}

      {task && (
        <>
          <label className="aa-task-field">
            <span className="aa-task-label">Task</span>
            <input
              className="aa-task-input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <p className="aa-task-meta">
            {task.isDone ? "Done" : "Open"} · added{" "}
            {new Date(task.createdAt).toLocaleDateString()}
          </p>
          <label className="aa-task-field">
            <span className="aa-task-label">Notes</span>
            <textarea
              className="aa-task-textarea"
              rows={6}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Add details, links, or next steps."
            />
          </label>
          {saveError && <p className="aa-task-err">{saveError}</p>}
          <div className="aa-task-actions">
            <Button variant="primary" onClick={saveTask} disabled={!canSave}>
              {saving ? "Saving" : "Save task"}
            </Button>
          </div>
        </>
      )}

      {!isLoading && !error && !task && (
        <p className="aa-task-state">
          This task doesn't exist — or isn't yours.
        </p>
      )}
    </div>
  );
}
