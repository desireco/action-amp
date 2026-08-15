import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getAppData, getWeekTasks } from "wasp/client/operations";
import {
  Button,
  CompletionCircle,
  GroupedList,
  TaskRow,
  type GroupDef,
  type TaskRowTask,
} from "../components/ui";
import { ListEmpty } from "./ListShell";
import "./ListShell.css";
import "./WeekPage.css";

function startOfWeek(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function dayKey(date: Date | string): string {
  const day = new Date(date);
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

/** The global Monday–Sunday scheduling horizon. Today remains the commitment
 * list; this page simply makes each dated task's intended day visible. */
export function WeekPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: tasks, isLoading } = useQuery(getWeekTasks);
  const { data: appData } = useQuery(getAppData);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const weekStart = useMemo(() => startOfWeek(), []);

  const groups = useMemo<GroupDef<TaskRowTask>[]>(() => {
    const byDay = new Map<string, TaskRowTask[]>();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + offset);
      byDay.set(dayKey(date), []);
    }
    for (const task of tasks ?? []) {
      if (task.dueDate) byDay.get(dayKey(task.dueDate))?.push(task);
    }
    return Array.from(byDay, ([key, items]) => {
      const [year, month, day] = key.split("-").map(Number);
      const date = new Date(year, month, day);
      const today = new Date();
      const label = date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      return {
        key,
        label: dayKey(date) === dayKey(today) ? `Today · ${label}` : label,
        items,
      };
    });
  }, [tasks, weekStart]);

  const count = tasks?.length ?? 0;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  return (
    <section className="aa-week" aria-label="This week">
      <header className="aa-list-header aa-week__hero">
        <div>
          <div className="aa-list-header__eyebrow">This week</div>
          <h1 className="aa-list-header__title aa-week__title">
            {isLoading ? "—" : `${count} scheduled`}
          </h1>
          <p className="aa-week__subtitle">
            Give work a day. Today stays small and deliberate.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate("/do/today")}>
          Today
        </Button>
      </header>

      {isLoading ? (
        <div className="aa-week__loading" aria-hidden="true">
          <div className="aa-list-skeleton-group">
            <div className="aa-list-skeleton aa-list-skeleton--heading" />
            <div className="aa-list-skeleton aa-list-skeleton--row" />
          </div>
        </div>
      ) : count === 0 ? (
        <ListEmpty
          icon={<CompletionCircle size="md" />}
          title="Nothing scheduled this week."
          text="Give an Upcoming task a day from its detail page when you are ready."
          action={<Button variant="secondary" size="md" onClick={() => navigate("/do/upcoming")}>See upcoming</Button>}
        />
      ) : (
        <GroupedList
          className="aa-week__list"
          groups={groups}
          keepEmptyGroups
          headingLevel={2}
          renderItem={(task) => (
            <TaskRow
              as="div"
              task={task}
              variant="list"
              showLens={(appData?.lenses.length ?? 0) > 1}
              className={activeTaskId === task.id ? "aa-week__row--active" : undefined}
              expanded={activeTaskId === task.id}
              onOpen={() => setActiveTaskId((current) => current === task.id ? null : task.id)}
            >
              <Button variant="ghost" size="sm" onClick={() => navigate(`/do/tasks/${task.permalink ?? task.id}`, { state: { returnTo } })}>
                Edit
              </Button>
            </TaskRow>
          )}
        />
      )}
    </section>
  );
}
