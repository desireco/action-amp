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
          <div
            className={`aa-task-check ${task.isDone ? "done" : ""}`}
            aria-hidden="true"
          >
            <svg viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 8.5l3 3 6-7"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
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
