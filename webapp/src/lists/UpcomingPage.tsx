import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getTasks, updateTaskContent, updateTaskStatus } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  TaskRow,
  CompletionCircle,
  GroupedList,
  type GroupDef,
  type TaskRowTask,
} from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "./ListShell";
import "./ListShell.css";
import "./UpcomingPage.css";

/**
 * Upcoming — tasks with status=UPCOMING (or a future dueDate), grouped by
 * how far out they are: Overdue / This week / Next week / Later / Unscheduled.
 *
 * Buckets:
 *   - Overdue:     dueDate in the past. Surfaced at the top in rose so a
 *                  forward-looking list never quietly hides something past due.
 *   - This week:   due in 0–7 days (inclusive of today).
 *   - Next week:   due in 8–14 days.
 *   - Later:       due beyond 14 days.
 *   - Unscheduled: no dueDate. Tasks with no date don't pretend to be "this
 *                  week" — they get a clear bucket of their own.
 */
export function UpcomingPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "UPCOMING", isDone: false } : undefined,
    { enabled: !!lens },
  );

  const groups = useMemo<GroupDef<TaskRowTask>[]>(() => {
    if (!tasks) return [];
    const buckets: Record<string, TaskRowTask[]> = {
      Overdue: [],
      "This week": [],
      "Next week": [],
      Later: [],
      Unscheduled: [],
    };
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (const t of tasks) {
      const due = t.dueDate ? new Date(t.dueDate) : null;
      if (!due) {
        buckets["Unscheduled"].push(t);
        continue;
      }
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - now.getTime()) / 86_400_000);
      if (diffDays < 0) buckets["Overdue"].push(t);
      else if (diffDays <= 7) buckets["This week"].push(t);
      else if (diffDays <= 14) buckets["Next week"].push(t);
      else buckets["Later"].push(t);
    }
    return Object.entries(buckets).map(([label, items]) => ({
      key: label,
      label,
      items,
    }));
  }, [tasks]);

  const handleSaveTaskContent = async (task: TaskRowTask, content: string) => {
    await updateTaskContent({ taskId: task.id, content });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
  };

  // Promote onto Today — same motion as the Today bench's swap and Someday's
  // promote. Reuses updateTaskStatus; invalidates getTasks (the Today + bench
  // lists), getTopTask (Next candidate pool), and getAppData (nav counts).
  const handlePromote = async (task: TaskRowTask) => {
    await updateTaskStatus({ id: task.id, status: "TODAY" });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  const count = tasks?.length ?? 0;
  const overdueCount =
    groups.find((g) => g.key === "Overdue")?.items.length ?? 0;

  // Hero copy adapts to what's on the page. The verb is always forward-looking.
  const heroSubtitle = (() => {
    if (isLoading) return "Tasks with a future date land here.";
    if (overdueCount > 0) {
      return `${overdueCount} overdue — these slipped past their date.`;
    }
    if (count === 0) return "Tasks with a future date land here.";
    return "The bench. Snoozed or scheduled — pull one onto Today when it's time.";
  })();

  return (
    <section className="aa-upcoming" aria-label="Upcoming">
      <header className="aa-list-header aa-upcoming__hero">
        <div className="aa-upcoming__hero-copy">
          <div className="aa-list-header__eyebrow">Upcoming</div>
          <h1 className="aa-list-header__title aa-upcoming__title">
            {isLoading ? "—" : `${count} on the bench`}
          </h1>
          <p className="aa-upcoming__subtitle">{heroSubtitle}</p>
        </div>
        {/* Symmetric cross-link — Today ↔ Upcoming. Mirrors the Upcoming link
            on Today's hero so the two pages point at each other. */}
        <Link to="/app/today" title="Open Today" aria-label="Open Today">
          <Button variant="secondary" size="sm">
            Today
          </Button>
        </Link>
      </header>

      {isLoading ? (
        <div className="aa-upcoming__loading" aria-hidden="true">
          <div className="aa-list-skeleton-group">
            <div className="aa-list-skeleton aa-list-skeleton--heading" />
            {[0, 1].map((i) => (
              <div
                key={i}
                className="aa-list-skeleton aa-list-skeleton--row"
              />
            ))}
          </div>
        </div>
      ) : count === 0 ? (
        <ListEmpty
          icon={<CompletionCircle size="md" />}
          title="Nothing upcoming."
          text="Tasks with a future date land here. Add a due date from triage or edit a task to schedule it."
          action={
            <Button variant="secondary" size="md" onClick={() => navigate("/app/inbox")}>
              Go to Inbox
            </Button>
          }
        />
      ) : (
        <GroupedList
          className="aa-upcoming__list"
          groups={groups}
          keepEmptyGroups={false}
          headingLevel={2}
          groupClassName={(label) =>
            label === "Overdue" ? "aa-grouped__group--overdue" : undefined
          }
          renderItem={(task) => (
            <TaskRow
              as="div"
              task={task}
              variant="list"
              onOpen={() => navigate(`/app/tasks/${task.permalink ?? task.id}`)}
              onSaveContent={handleSaveTaskContent}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePromote(task)}
                title="Promote to Today"
              >
                Today
              </Button>
            </TaskRow>
          )}
        />
      )}
    </section>
  );
}
