import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getTasks } from "wasp/client/operations";
import { TaskRow, CompletionCircle, GroupedList, type GroupDef, type TaskRowTask } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "./ListShell";
import "./ListShell.css";

/**
 * Upcoming — tasks with status=UPCOMING (or a future dueDate), grouped by
 * how far out they are: This week / Next week / Later.
 */
export function UpcomingPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const { data: tasks, isLoading } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "UPCOMING", isDone: false } : undefined,
    { enabled: !!lens },
  );

  const groups = useMemo<GroupDef<TaskRowTask>[]>(() => {
    if (!tasks) return [];
    const buckets: Record<string, TaskRowTask[]> = { "This week": [], "Next week": [], Later: [] };
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (const t of tasks) {
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (!due) {
        buckets["This week"].push(t);
        continue;
      }
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - now.getTime()) / 86_400_000);
      if (diffDays <= 7) buckets["This week"].push(t);
      else if (diffDays <= 14) buckets["Next week"].push(t);
      else buckets["Later"].push(t);
    }
    return Object.entries(buckets).map(([label, items]) => ({ key: label, label, items }));
  }, [tasks]);

  if (!isLoading && (tasks?.length ?? 0) === 0) {
    return (
      <ListEmpty
        icon={<CompletionCircle size="md" />}
        title="Nothing upcoming."
        text="Tasks with a future date land here. Add a due date from triage or edit a task to schedule it."
      />
    );
  }

  return (
    <div className="aa-list-shell">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Upcoming</div>
          <h1 className="aa-list-header__title">{tasks?.length ?? 0} scheduled</h1>
        </div>
      </header>
      <GroupedList
        groups={groups}
        keepEmptyGroups={false}
        renderItem={(task) => (
          <TaskRow
            task={task}
            onOpen={() => navigate(`/app/tasks/${task.id}`)}
          />
        )}
      />
    </div>
  );
}
