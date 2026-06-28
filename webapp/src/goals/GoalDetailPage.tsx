import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getGoal, createTask, toggleTaskDone, updateTaskStatus } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Chip, TaskRow, CompletionCircle, type TaskRowTask } from "../components/ui";
import { CreateInline } from "../lists/CreateInline";
import type { GroupDef } from "../components/ui";
import "./GoalDetailPage.css";

type GoalTask = TaskRowTask & {
  status: "TODAY" | "UPCOMING" | "SOMEDAY";
};

type LinkedProject = {
  id: string;
  name: string;
  isDone: boolean;
  dueDate: Date | string | null;
  tasks: { id: string; isDone: boolean }[];
};

type GoalData = {
  id: string;
  name: string;
  description: string | null;
  isDone: boolean;
  lensId: string;
  tasks: GoalTask[];
  projects: LinkedProject[];
};

/**
 * Goal detail — the dedicated URL for working on a single Goal. Mirrors
 * ProjectDetailPage's shape, scoped to a Goal: header with aggregate progress,
 * the goal's standalone tasks grouped by horizon (Today/Upcoming/Someday/Done),
 * and the list of projects linked to this goal (each its own linkable detail).
 * Add-task creates a standalone task under the goal (no project).
 *
 * The goal's lensId is taken from the record itself (not the active sidebar
 * lens), so a task added here always joins the right lens.
 */
export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: goal, isLoading, error } = useQuery(getGoal, { id: id! });
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Standalone tasks grouped by horizon (same buckets as Project detail).
  const groups = useMemo<GroupDef<GoalTask>[]>(() => {
    if (!goal) return [];
    const buckets: Record<string, GoalTask[]> = { TODAY: [], UPCOMING: [], SOMEDAY: [], DONE: [] };
    for (const t of goal.tasks) {
      (t.isDone ? buckets.DONE : buckets[t.status] ?? buckets.SOMEDAY).push(t);
    }
    return [
      { key: "TODAY", label: "Today", items: buckets.TODAY },
      { key: "UPCOMING", label: "Upcoming", items: buckets.UPCOMING },
      { key: "SOMEDAY", label: "Someday", items: buckets.SOMEDAY },
      { key: "DONE", label: "Done", items: buckets.DONE },
    ];
  }, [goal]);

  // Aggregate progress across standalone tasks + every linked project's tasks.
  // Matches the rollup getGoals computes for the list view, so the two agree.
  const { progress, totalItems, doneItems } = useMemo(() => {
    if (!goal) return { progress: 0, totalItems: 0, doneItems: 0 };
    const taskDone = goal.tasks.filter((t) => t.isDone).length;
    const projectTaskDone = goal.projects.flatMap((p) => p.tasks).filter((t) => t.isDone).length;
    const done = taskDone + projectTaskDone;
    const total = goal.tasks.length + goal.projects.flatMap((p) => p.tasks).length;
    return {
      progress: total === 0 ? 0 : Math.round((done / total) * 100),
      totalItems: total,
      doneItems: done,
    };
  }, [goal]);

  const handleToggle = async (task: TaskRowTask) => {
    try {
      await toggleTaskDone({ id: task.id });
      queryClient.invalidateQueries({ queryKey: ["getGoal"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    } catch {
      // optimistic state reverts via react-query refetch
    }
  };

  const setStatus = async (task: GoalTask, status: GoalTask["status"]) => {
    await updateTaskStatus({ id: task.id, status });
    queryClient.invalidateQueries({ queryKey: ["getGoal"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  const handleCreate = async (description: string) => {
    if (!goal) return;
    setSubmitting(true);
    try {
      await createTask({ description, lensId: goal.lensId, goalId: goal.id });
      queryClient.invalidateQueries({ queryKey: ["getGoal"] });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setCreating(false);
    } finally {
      setSubmitting(false);
    }
  };

  const standaloneTotal = goal?.tasks.length ?? 0;

  return (
    <div className="aa-goal">
      <Link className="aa-task-back" to="/app/goals">
        ← Goals
      </Link>

      {isLoading && <p className="aa-task-state">Loading…</p>}

      {error && <div className="aa-task-state aa-task-err">Couldn't load this goal.</div>}

      {goal && (
        <>
          <header className="aa-list-header aa-goal__header">
            <div>
              <div className="aa-list-header__eyebrow">Goal</div>
              <h1 className="aa-list-header__title">{goal.name}</h1>
              {totalItems > 0 && (
                <p className="aa-goal__meta">
                  <span>{doneItems}/{totalItems} done · {progress}%</span>
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCreating((v) => !v)}>
              {creating ? "Cancel" : "Add task"}
            </Button>
          </header>

          {goal.description && <p className="aa-goal__desc">{goal.description}</p>}

          {creating && (
            <CreateInline
              placeholder="What needs doing?"
              onCreate={handleCreate}
              onCancel={() => setCreating(false)}
              submitting={submitting}
            />
          )}

          {/* Linked projects — each linkable to its own detail view. */}
          {goal.projects.length > 0 && (
            <section className="aa-goal__projects">
              <h3 className="aa-grouped__heading">
                Projects <span className="aa-grouped__count">{goal.projects.length}</span>
              </h3>
              <ul className="aa-grouped__list">
                {goal.projects.map((p) => {
                  const pDone = p.tasks.filter((t) => t.isDone).length;
                  const pTotal = p.tasks.length;
                  const pct = pTotal === 0 ? 0 : Math.round((pDone / pTotal) * 100);
                  return (
                    <li key={p.id} className="aa-grouped__item aa-goal__project-row">
                      <Link to={`/app/projects/${p.id}`} className="aa-goal__project-link">
                        <span className="aa-goal__project-name">{p.name}</span>
                        {pTotal > 0 && <span className="aa-goal__project-pct">{pct}%</span>}
                        {p.dueDate && <Chip variant="teal" small>{formatDue(p.dueDate)}</Chip>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Standalone tasks under this goal, grouped by horizon. */}
          {standaloneTotal === 0 ? (
            <div className="aa-list-empty aa-goal__empty">
              <div className="aa-list-empty__icon"><CompletionCircle size="md" /></div>
              <h2 className="aa-list-empty__title">No standalone tasks.</h2>
              <p className="aa-list-empty__text">
                {goal.projects.length > 0
                  ? "Tasks live in this goal's projects — or add a standalone one here."
                  : "Add the first step — a task lands on Upcoming and shows on What Now."}
              </p>
            </div>
          ) : (
            <div className="aa-grouped">
              {groups.map((group) => {
                if (group.items.length === 0) return null;
                return (
                  <section key={group.key} className="aa-grouped__group">
                    <h3 className="aa-grouped__heading">
                      {group.label}
                      <span className="aa-grouped__count">{group.items.length}</span>
                    </h3>
                    <ul className="aa-grouped__list">
                      {group.items.map((task) => (
                        <li key={task.id} className="aa-grouped__item aa-goal__row">
                          <TaskRow
                            task={task}
                            muted={task.status === "SOMEDAY" || task.isDone}
                            onToggleDone={handleToggle}
                            onOpen={() => navigate(`/app/tasks/${task.id}`)}
                          />
                          {!task.isDone && (
                            <div className="aa-goal__horizon">
                              {task.status !== "TODAY" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setStatus(task, task.status === "SOMEDAY" ? "UPCOMING" : "TODAY")}
                                >
                                  {task.status === "SOMEDAY" ? "Upcoming" : "Today"}
                                </Button>
                              )}
                              {task.status === "TODAY" && (
                                <Button variant="ghost" size="sm" onClick={() => setStatus(task, "UPCOMING")}>
                                  Not today
                                </Button>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {!isLoading && !error && !goal && (
        <p className="aa-task-state">This goal doesn't exist — or isn't yours.</p>
      )}
    </div>
  );
}

function formatDue(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
