import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getProject, createTask, toggleTaskDone, updateTaskStatus } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Chip, TaskRow, CompletionCircle, type TaskRowTask } from "../components/ui";
import { CreateInline } from "../lists/CreateInline";
import type { GroupDef } from "../components/ui";
import "./ProjectDetailPage.css";

type ProjectTask = TaskRowTask & {
  status: "TODAY" | "UPCOMING" | "SOMEDAY";
};

type ProjectData = {
  id: string;
  name: string;
  description: string | null;
  dueDate: Date | string | null;
  isDone: boolean;
  lensId: string;
  goal: { id: string; name: string } | null;
  tasks: ProjectTask[];
};

/**
 * Project detail — the dedicated URL for working on a single Project. Shows its
 * tasks grouped by horizon (Today / Upcoming / Someday / Done), lets you add a
 * task inline, complete one, or move it between horizons. The project's lensId
 * is taken from the record itself (not the active sidebar lens), so a task you
 * add here always joins the right lens.
 */
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: project, isLoading, error } = useQuery(getProject, { id: id! });
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Group the project's tasks by horizon. Open tasks split into Today / Upcoming
  // / Someday; done ones collect at the bottom. Empty horizons are hidden (the
  // project reads as what's actually there, not a wall of empty sections).
  const groups = useMemo<GroupDef<ProjectTask>[]>(() => {
    if (!project) return [];
    const buckets: Record<string, ProjectTask[]> = { TODAY: [], UPCOMING: [], SOMEDAY: [], DONE: [] };
    for (const t of project.tasks) {
      (t.isDone ? buckets.DONE : buckets[t.status] ?? buckets.SOMEDAY).push(t);
    }
    return [
      { key: "TODAY", label: "Today", items: buckets.TODAY },
      { key: "UPCOMING", label: "Upcoming", items: buckets.UPCOMING },
      { key: "SOMEDAY", label: "Someday", items: buckets.SOMEDAY },
      { key: "DONE", label: "Done", items: buckets.DONE },
    ];
  }, [project]);

  const doneCount = project?.tasks.filter((t) => t.isDone).length ?? 0;
  const total = project?.tasks.length ?? 0;

  const handleToggle = async (task: TaskRowTask) => {
    try {
      await toggleTaskDone({ id: task.id });
      queryClient.invalidateQueries({ queryKey: ["getProject"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    } catch {
      // optimistic state reverts via react-query refetch
    }
  };

  // Move a task between horizons. "Next horizon up" cycles Someday→Upcoming→Today;
  // the row's button reflects the inverse action (the thing you'd do next).
  const setStatus = async (task: ProjectTask, status: ProjectTask["status"]) => {
    await updateTaskStatus({ id: task.id, status });
    queryClient.invalidateQueries({ queryKey: ["getProject"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  const handleCreate = async (description: string) => {
    if (!project) return;
    setSubmitting(true);
    try {
      await createTask({ description, lensId: project.lensId, projectId: project.id });
      queryClient.invalidateQueries({ queryKey: ["getProject"] });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setCreating(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="aa-project">
      <Link className="aa-task-back" to="/app/projects">
        ← Projects
      </Link>

      {isLoading && <p className="aa-task-state">Loading…</p>}

      {error && <div className="aa-task-state aa-task-err">Couldn't load this project.</div>}

      {project && (
        <>
          <header className="aa-list-header aa-project__header">
            <div>
              <div className="aa-list-header__eyebrow">
                Project{project.goal ? ` · ${project.goal.name}` : ""}
              </div>
              <h1 className="aa-list-header__title">{project.name}</h1>
              {(total > 0 || project.dueDate) && (
                <p className="aa-project__meta">
                  {total > 0 && <span>{doneCount}/{total} done</span>}
                  {project.dueDate && (
                    <Chip variant="teal" small>{formatDue(project.dueDate)}</Chip>
                  )}
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCreating((v) => !v)}>
              {creating ? "Cancel" : "Add task"}
            </Button>
          </header>

          {project.description && <p className="aa-project__desc">{project.description}</p>}

          {creating && (
            <CreateInline
              placeholder="What needs doing?"
              onCreate={handleCreate}
              onCancel={() => setCreating(false)}
              submitting={submitting}
            />
          )}

          {total === 0 ? (
            <div className="aa-list-empty aa-project__empty">
              <div className="aa-list-empty__icon"><CompletionCircle size="md" /></div>
              <h2 className="aa-list-empty__title">No tasks yet.</h2>
              <p className="aa-list-empty__text">
                Add the first step — a task lands on Upcoming and shows on Next.
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
                        <li key={task.id} className="aa-grouped__item aa-project__row">
                          <TaskRow
                            task={task}
                            muted={task.status === "SOMEDAY" || task.isDone}
                            onToggleDone={handleToggle}
                            onOpen={() => navigate(`/app/tasks/${task.id}`)}
                          />
                          {!task.isDone && (
                            <div className="aa-project__horizon">
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

      {!isLoading && !error && !project && (
        <p className="aa-task-state">This project doesn't exist — or isn't yours.</p>
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
