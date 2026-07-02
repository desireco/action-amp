import { useParams, Link } from "react-router";
import { useQuery, getTask } from "wasp/client/operations";
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
  const { data: task, isLoading, error } = useQuery(getTask, { id: id! });

  return (
    <div className="aa-task">
      <Link className="aa-task-back" to="/app">
        ← Next
      </Link>

      {isLoading && <p className="aa-task-state">Loading…</p>}

      {error && (
        <div className="aa-task-state aa-task-err">Couldn't load this task.</div>
      )}

      {task && (
        <>
          <h1 className="aa-task-title">{task.description}</h1>
          <p className="aa-task-meta">
            {task.isDone ? "Done" : "Open"} · added{" "}
            {new Date(task.createdAt).toLocaleDateString()}
          </p>
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
