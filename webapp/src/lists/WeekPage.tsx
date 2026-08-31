import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, getAppData, getWeekTasks } from "wasp/client/operations";
import {
  Button,
  CompletionCircle,
  GroupedList,
  TaskRow,
  type GroupDef,
  type TaskRowTask,
} from "../components/ui";
import { ListEmpty } from "./ListShell";
import { bucketWeekTasks, dayKey } from "./weekView";
import { TaskRowEditor } from "../tasks/TaskRowEditor";
import {
  currentPlainDate,
  plainDateFrom,
} from "../shared/time/temporal";
import "./ListShell.css";
import "./WeekPage.css";

function startOfWeek(): string {
  const today = currentPlainDate();
  return today.subtract({ days: today.dayOfWeek - 1 }).toString();
}

/** The global Monday–Sunday scheduling horizon. Today remains the commitment
 * list; this page simply makes each dated task's intended day visible. */
export function WeekPage() {
  const navigate = useNavigate();
  const { data: tasks, isLoading } = useQuery(getWeekTasks);
  const { data: appData } = useQuery(getAppData);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const weekStart = useMemo(() => startOfWeek(), []);

  const groups = useMemo<GroupDef<TaskRowTask>[]>(() => {
    // Pure bucketing (weekView.ts): dated → its weekday, overdue → Today,
    // TODAY-undated → Today. Tested in weekView.test.ts.
    return bucketWeekTasks(tasks ?? [], weekStart).map(({ key, items }) => {
      const date = plainDateFrom(key);
      const label = date.toLocaleString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      return {
        key,
        label:
          dayKey(key) === currentPlainDate().toString()
            ? `Today · ${label}`
            : label,
        items,
      };
    });
  }, [tasks, weekStart]);

  const count = tasks?.length ?? 0;

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
              <TaskRowEditor
                task={task}
                onClose={() => setActiveTaskId(null)}
              />
            </TaskRow>
          )}
        />
      )}
    </section>
  );
}
