import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getTasks, toggleTaskDone } from "wasp/client/operations";
import { TaskRow, CompletionCircle, Chip, type TaskRowTask } from "../components/ui";
import { GroupedList, type GroupDef } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "./ListShell";
import "./ListShell.css";
import "./TodayPage.css";

const TODAY_CAP = 5;

/**
 * Today — the committed-for-today list. Tasks with status=TODAY (not done),
 * grouped by Goal. Enforces a 5-item cap (FEATURES.md F12): items beyond the
 * cap are flagged as "over capacity" and must be bumped out to add more.
 */
export function TodayPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const { data: tasks, isLoading } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "TODAY", isDone: false } : undefined,
    { enabled: !!lens },
  );

  const groups = useMemo<GroupDef<TaskRowTask>[]>(() => {
    if (!tasks) return [];
    // Group the CAPPED set (first TODAY_CAP) by Goal (or "General").
    const capped = tasks.slice(0, TODAY_CAP);
    const byGoal = new Map<string, TaskRowTask[]>();
    for (const t of capped) {
      const key = t.goal?.name ?? "General";
      if (!byGoal.has(key)) byGoal.set(key, []);
      byGoal.get(key)!.push(t);
    }
    return Array.from(byGoal, ([name, items]) => ({ key: name, label: name, items }));
  }, [tasks]);

  const doneGroups = useMemo<GroupDef<TaskRowTask>[]>(() => {
    // Done-today section is collapsed by default; re-query on demand later.
    return [];
  }, []);

  const handleToggle = async (task: TaskRowTask) => {
    try {
      await toggleTaskDone({ id: task.id });
    } catch {
      // optimistic state will revert via react-query refetch on error
    }
  };

  const overCapacity = (tasks?.length ?? 0) > TODAY_CAP;
  const overflow = useMemo(() => (tasks ?? []).slice(TODAY_CAP), [tasks]);

  if (!isLoading && (tasks?.length ?? 0) === 0) {
    return (
      <ListEmpty
        icon={<CompletionCircle size="md" />}
        title="Nothing today."
        text="Commit a task to Today from Inbox, Upcoming, or Someday — the list caps at 5 on purpose."
      />
    );
  }

  return (
    <div className="aa-today">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Today</div>
          <h1 className="aa-list-header__title">
            {tasks?.length ?? 0} of {TODAY_CAP} committed
          </h1>
        </div>
      </header>

      {overCapacity && (
        <div className="aa-today__overflow-banner">
          <Chip variant="amber">Over capacity</Chip>
          <span>
            {overflow.length} task{overflow.length === 1 ? "" : "s"} beyond the cap of {TODAY_CAP}. Bump one to
            Upcoming or Someday to make room.
          </span>
        </div>
      )}

      <GroupedList
        groups={groups}
        renderItem={(task) => (
          <TaskRow
            task={task}
            onToggleDone={handleToggle}
            onOpen={() => navigate(`/app/tasks/${task.id}`)}
          />
        )}
      />

      {overflow.length > 0 && (
        <section className="aa-today__overflow">
          <h3 className="aa-grouped__heading">
            Beyond the cap <span className="aa-grouped__count">{overflow.length}</span>
          </h3>
          <ul className="aa-grouped__list">
            {overflow.map((task) => (
              <li key={task.id} className="aa-grouped__item">
                <TaskRow
                  task={task}
                  muted
                  onToggleDone={handleToggle}
                  onOpen={() => navigate(`/app/tasks/${task.id}`)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {doneGroups.length > 0 && <div className="aa-today__done-section">{/* TODO: collapsed "Done today" */}</div>}
    </div>
  );
}
