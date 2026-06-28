import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getTasks, getDoneToday, toggleTaskDone, updateTaskStatus } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Button, TaskRow, CompletionCircle, Chip, type TaskRowTask } from "../components/ui";
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
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "TODAY", isDone: false } : undefined,
    { enabled: !!lens },
  );
  // Upcoming bench: status=UPCOMING tasks in the active lens, surfaced when
  // the user swaps to pull one onto today. Lazy — only fetched when the bench
  // is open, to avoid the cost on a normal Today load.
  const [showUpcoming, setShowUpcoming] = useState(false);
  const { data: upcoming } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "UPCOMING", isDone: false } : undefined,
    { enabled: !!lens && showUpcoming },
  );

  // Done-today: tasks completed since local midnight. Fetched on mount (not
  // lazy) so the collapsed header can show the count; the rows render only when
  // the section is expanded. The set is small (lens-scoped, today-only), so the
  // cost on a normal Today load is negligible.
  const [showDone, setShowDone] = useState(false);
  const { data: doneToday } = useQuery(
    getDoneToday,
    lens ? { lensId: lens.id } : undefined,
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

  // Done-today grouped by Goal (or "General"), same shape as the open-task
  // groups so GroupedList + TaskRow render identically (muted). Empty until
  // the eager getDoneToday query resolves (fetched on mount so the collapsed
  // count is known without expanding).
  const doneGroups = useMemo<GroupDef<TaskRowTask>[]>(() => {
    if (!doneToday) return [];
    const byGoal = new Map<string, TaskRowTask[]>();
    for (const t of doneToday) {
      const key = t.goal?.name ?? "General";
      if (!byGoal.has(key)) byGoal.set(key, []);
      byGoal.get(key)!.push(t);
    }
    return Array.from(byGoal, ([name, items]) => ({ key: name, label: name, items }));
  }, [doneToday]);

  const handleToggle = async (task: TaskRowTask) => {
    try {
      await toggleTaskDone({ id: task.id });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
      queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    } catch {
      // optimistic state will revert via react-query refetch on error
    }
  };

  // Promote an Upcoming task onto Today; demote a Today task to Upcoming
  // (the bench — keeps it reachable via the swap, never "disappears").
  const handlePromote = async (task: TaskRowTask) => {
    await updateTaskStatus({ id: task.id, status: "TODAY" });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };
  const handleDemote = async (task: TaskRowTask) => {
    await updateTaskStatus({ id: task.id, status: "UPCOMING" });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  const overCapacity = (tasks?.length ?? 0) > TODAY_CAP;
  const overflow = useMemo(() => (tasks ?? []).slice(TODAY_CAP), [tasks]);

  // Note: no early empty-state return — the header (with the See-upcoming
  // toggle) renders even when Today is empty, so the bench is always reachable.
  const isEmpty = !isLoading && (tasks?.length ?? 0) === 0;

  return (
    <div className="aa-today">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Today</div>
          <h1 className="aa-list-header__title">
            {tasks?.length ?? 0} of {TODAY_CAP} committed
          </h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowUpcoming((v) => !v)}
          aria-expanded={showUpcoming}
        >
          {showUpcoming ? "Back to Today" : "See upcoming"}
        </Button>
      </header>

      {showUpcoming ? (
        // Upcoming bench: status=UPCOMING tasks in the active lens. Each row
        // has a "Today" control to promote it onto today. Empty state is calm
        // — nothing's been deferred, nothing to swap in.
        <section className="aa-today__upcoming">
          <h3 className="aa-grouped__heading">Upcoming</h3>
          {(upcoming ?? []).length === 0 ? (
            <p className="aa-today__upcoming-empty">Nothing on the bench. Snooze a task and it'll show up here.</p>
          ) : (
            <ul className="aa-grouped__list">
              {(upcoming ?? []).map((task) => (
                <li key={task.id} className="aa-grouped__item aa-today__swap-row">
                  <TaskRow task={task} onOpen={() => navigate(`/app/tasks/${task.id}`)} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handlePromote(task)}
                  >
                    Today
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {isEmpty ? (
            <ListEmpty
              icon={<CompletionCircle size="md" />}
              title="Nothing today."
              text="Pull one in from Upcoming, or triage something from the Inbox."
            />
          ) : (
            <>
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
              <div className="aa-today__swap-row" key={task.id}>
                <TaskRow
                  task={task}
                  onToggleDone={handleToggle}
                  onOpen={() => navigate(`/app/tasks/${task.id}`)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDemote(task)}
                  title="Move back to Upcoming"
                >
                  Not today
                </Button>
              </div>
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
            </>
          )}
        </>
      )}

      {(doneToday?.length ?? 0) > 0 && (
        <section className="aa-today__done-section">
          <button
            type="button"
            className="aa-today__done-header"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
          >
            <span>Done today</span>
            <span className="aa-today__done-count">{doneToday!.length}</span>
          </button>
          {showDone && (
            <GroupedList
              groups={doneGroups}
              renderItem={(task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  muted
                  onToggleDone={handleToggle}
                  onOpen={() => navigate(`/app/tasks/${task.id}`)}
                />
              )}
            />
          )}
        </section>
      )}
    </div>
  );
}
