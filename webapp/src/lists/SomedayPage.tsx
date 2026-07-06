import { useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getTasks } from "wasp/client/operations";
import {
  TaskRow,
  Button,
  CompletionCircle,
} from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "./ListShell";
import { useTaskListActions } from "./useTaskListActions";
import "./ListShell.css";
import "./SomedayPage.css";

/**
 * Someday — undated, deprioritized tasks. Flat list, lighter visual weight
 * (muted rows). Each row has a "→ Today" control to promote it back onto the
 * court (reuses updateTaskStatus, same motion as the Today bench promote).
 * No "→ Upcoming" — Upcoming is reached via snooze from Next/Today, not
 * from Someday, so a second destination would muddy the single promote path.
 */
export function SomedayPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const { promoteToToday } = useTaskListActions();
  const { data: tasks, isLoading } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "SOMEDAY", isDone: false } : undefined,
    { enabled: !!lens },
  );

  if (!isLoading && (tasks?.length ?? 0) === 0) {
    return (
      <ListEmpty
        icon={<CompletionCircle size="md" />}
        title="Nothing for Someday."
        text="Someday is for things you want to keep but stop nagging about. Send a task here from triage or by changing its status."
      />
    );
  }

  return (
    <div className="aa-list-shell">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Someday</div>
          <h1 className="aa-list-header__title">{tasks?.length ?? 0} parked</h1>
        </div>
      </header>
      <ul className="aa-someday-list">
        {(tasks ?? []).map((task) => (
          <li key={task.id} className="aa-someday-row">
            <TaskRow
              task={task}
              muted
              onOpen={() => navigate(`/app/tasks/${task.permalink ?? task.id}`)}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => promoteToToday(task)}
                title="Move to Today"
              >
                Today
              </Button>
            </TaskRow>
          </li>
        ))}
      </ul>
    </div>
  );
}
