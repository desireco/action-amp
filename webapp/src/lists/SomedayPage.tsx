import { useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getTasks, toggleTaskDone } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { TaskRow, CompletionCircle, type TaskRowTask } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "./ListShell";
import "./ListShell.css";

/**
 * Someday — undated, deprioritized tasks. Flat list, lighter visual weight
 * (muted rows). Promote via the row's project/due chips once that flow lands.
 */
export function SomedayPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "SOMEDAY", isDone: false } : undefined,
    { enabled: !!lens },
  );

  const handleToggle = async (task: TaskRowTask) => {
    try {
      await toggleTaskDone({ id: task.id });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    } catch {
      /* reverts via refetch */
    }
  };

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
          <TaskRow
            key={task.id}
            task={task}
            muted
            onToggleDone={handleToggle}
            onOpen={() => navigate(`/app/tasks/${task.id}`)}
          />
        ))}
      </ul>
    </div>
  );
}
