import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Task } from "@prisma/client";
import {
  useQuery,
  getTodayTasks,
  getWeekTasks,
  getDoneToday,
  getAppData,
  submitFeedback,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  CountLinkButton,
  TaskRow,
  CompletionCircle,
  Chip,
  GroupedList,
  type GroupDef,
  type TaskRowTask,
} from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { FeedbackDialog } from "../app/FeedbackDialog";
import { captureFeedbackContext } from "../feedback/captureContext";
import { ListEmpty } from "./ListShell";
import { TaskRowEditor } from "../tasks/TaskRowEditor";
import { TODAY_CAP_DEFAULT } from "../app/operations";
import "./ListShell.css";
import "./TodayPage.css";

/**
 * Group tasks by their Goal (or "General" when a task carries none). When the
 * only group is the default "General", the heading carries no information —
 * blank the label and GroupedList renders the rows without it. Used for both
 * the open-task groups and the done-today groups so they render identically.
 */
function groupByGoal(tasks: TaskRowTask[]): GroupDef<TaskRowTask>[] {
  const byGoal = new Map<string, TaskRowTask[]>();
  for (const t of tasks) {
    const key = t.goal?.name ?? "General";
    if (!byGoal.has(key)) byGoal.set(key, []);
    byGoal.get(key)!.push(t);
  }
  const soloGeneral = byGoal.size === 1 && byGoal.has("General");
  return Array.from(byGoal, ([name, items]) => ({
    key: name,
    label: soloGeneral ? "" : name,
    items,
  }));
}

/**
 * Today — the global committed-for-today list (across all accessible lenses,
 * WORKFLOW.md §5.11). Tasks with status=TODAY (not done), grouped by Goal.
 * Enforces the user's `todayCap` (default 5, range 3–12, set in Preferences):
 * items beyond the cap are flagged "over capacity" and must be bumped out to
 * add more. Each row carries a trailing lens pill so provenance stays visible
 * without partitioning the list (only when the user has 2+ lenses — a single
 * lens makes the pill noise).
 */
export function TodayPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Today is universal — no lens arg, no enabled gate. The query filters by
  // the accessible-lens set server-side, so a FREE user sees their one lens
  // and a Pro user sees all of them. `lens` is still read for the feedback
  // dialog's context only.
  const { data: tasks, isLoading } = useQuery(getTodayTasks);
  const { data: weekTasks } = useQuery(getWeekTasks);
  // App data carries the user's todayCap + the lens list (for the pill gate)
  // + the lens-scoped Upcoming count for the hero cross-link (Upcoming stays
  // lens-scoped — the link still lands in the active lens, per design).
  const { data: appData } = useQuery(getAppData);

  const todayCap = appData?.todayCap ?? TODAY_CAP_DEFAULT;
  const showLensPill = (appData?.lenses.length ?? 0) > 1;

  // Done-today: tasks completed since local midnight, global across lenses.
  const [showDone, setShowDone] = useState(true);
  const { data: doneToday } = useQuery(getDoneToday, undefined);

  // Active row for the click-to-reveal action drawer. Null = no row open.
  // Mirrors UpcomingPage's pattern. Done-today rows navigate on click instead
  // (review surface) and keep their always-visible Leave-feedback button.
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Open tasks: group the CAPPED set (first todayCap) by Goal.
  const groups = useMemo<GroupDef<TaskRowTask>[]>(
    () => (tasks ? groupByGoal(tasks.slice(0, todayCap)) : []),
    [tasks, todayCap],
  );

  // Done-today grouped by Goal, same shape so GroupedList + TaskRow render
  // identically (muted). Empty until the eager getDoneToday query resolves.
  const doneGroups = useMemo<GroupDef<TaskRowTask>[]>(
    () => (doneToday ? groupByGoal(doneToday) : []),
    [doneToday],
  );

  const [feedbackTask, setFeedbackTask] = useState<TaskRowTask | null>(null);

  const overCapacity = (tasks?.length ?? 0) > todayCap;
  const overflow = useMemo(() => (tasks ?? []).slice(todayCap), [tasks, todayCap]);
  const committedCount = Math.min(tasks?.length ?? 0, todayCap);
  const upcomingCount = appData?.counts.upcoming ?? 0;
  const weekCount = weekTasks?.length;
  const doneCount = doneToday?.length ?? 0;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const editTask = (task: TaskRowTask) => {
    navigate(`/do/tasks/${task.permalink ?? task.id}`, {
      state: { returnTo },
    });
  };
  const pickTask = (task: TaskRowTask) => {
    navigate(`/do/today/${encodeURIComponent(task.permalink ?? task.id)}`);
  };

  const isEmpty = !isLoading && (tasks?.length ?? 0) === 0;
  // Hero copy describes Today — how full the day is. Upcoming is one click
  // away via the hero link, no same-page swap.
  const heroTitle = isLoading
    ? "—"
    : `${tasks?.length ?? 0} of ${todayCap} committed`;
  const heroSubtitle =
    committedCount >= todayCap
      ? "Day's full. Finish one to make room."
      : "Keep the day small enough to finish.";

  return (
    <section className="aa-today" aria-label="Today">
      <header className="aa-list-header aa-today__hero">
        <div className="aa-today__hero-copy">
          <div className="aa-list-header__eyebrow">Today</div>
          <h1 className="aa-list-header__title aa-today__title">{heroTitle}</h1>
          <p className="aa-today__subtitle">{heroSubtitle}</p>
          <div
            className="aa-today__meter"
            aria-label={`${committedCount} of ${todayCap} Today slots committed`}
          >
            {Array.from({ length: todayCap }, (_, i) => (
              <span
                key={i}
                className={
                  i < committedCount
                    ? "aa-today__meter-dot aa-today__meter-dot--filled"
                    : "aa-today__meter-dot"
                }
              />
            ))}
          </div>
        </div>
        <div className="aa-today__hero-links">
          <CountLinkButton label="This week" count={weekCount} to="/do/week" />
          {/* Upcoming count rides the shared getAppData query (same one feeding
              the Plan nav chip), so it stays accurate without a second fetch. */}
          <CountLinkButton
            label="Upcoming"
            count={appData ? upcomingCount : undefined}
            to="/do/upcoming"
          />
        </div>
      </header>

      <div id="aa-today-body">
        {isLoading ? (
          // Skeleton: title row already rendered "—" above; show muted list
          // placeholders so the page doesn't snap in once data resolves.
          <div className="aa-today__loading" aria-hidden="true">
            <div className="aa-list-skeleton-group">
              <div className="aa-list-skeleton aa-list-skeleton--heading" />
              {[0, 1].map((i) => (
                <div key={i} className="aa-list-skeleton aa-list-skeleton--row" />
              ))}
            </div>
          </div>
        ) : isEmpty ? (
          <ListEmpty
            icon={<CompletionCircle size="md" />}
            title="Nothing today."
            text="Pull one in from Upcoming, or triage something from the Inbox."
            action={
              upcomingCount > 0 ? (
                <Link to="/do/upcoming">
                  <Button variant="secondary" size="md">
                    See upcoming {upcomingCount}
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            {overCapacity && (
              <div className="aa-today__overflow-banner" role="status">
                <Chip variant="amber">Over capacity</Chip>
                <span>
                  {overflow.length} task{overflow.length === 1 ? "" : "s"}{" "}
                  beyond the cap of {todayCap}. Bump one to Upcoming or Someday
                  to make room.
                </span>
              </div>
            )}

            <GroupedList
              className="aa-today__list"
              groups={groups}
              headingLevel={2}
              renderItem={(task) => (
                <TaskRow
                  as="div"
                  variant="list"
                  key={task.id}
                  task={task}
                  showLens={showLensPill}
                  className={`aa-today__row${activeTaskId === task.id ? " aa-today__row--active" : ""}`}
                  expanded={activeTaskId === task.id}
                  onOpen={() =>
                    setActiveTaskId((current) =>
                      current === task.id ? null : task.id,
                    )
                  }
                  below={<TaskRowEditor task={task} />}
                />
              )}
            />

            {overflow.length > 0 && (
              // Overflow inherits the amber banner above as its single signal —
              // no separate "Beyond the cap" heading that would describe the
              // same N twice. Items render at the bottom of the list, muted.
              <ul
                className="aa-grouped__list aa-today__overflow"
                aria-label={`Beyond the cap, ${overflow.length} task${
                  overflow.length === 1 ? "" : "s"
                }`}
              >
                {overflow.map((task: Task) => (
                  <li key={task.id} className="aa-grouped__item">
                    <TaskRow
                      as="div"
                      variant="list"
                      task={task}
                      showLens={showLensPill}
                      muted
                      className={`aa-today__row${activeTaskId === task.id ? " aa-today__row--active" : ""}`}
                      expanded={activeTaskId === task.id}
                      onOpen={() =>
                        setActiveTaskId((current) =>
                          current === task.id ? null : task.id,
                        )
                      }
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => pickTask(task)}
                        title="Start focus on this task"
                      >
                        Do
                      </Button>
                    </TaskRow>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {doneCount > 0 && (
        <section className="aa-today__done-section" aria-label="Done today">
          <div className="aa-today__done-header">
            <div className="aa-today__done-title">
              <span>Done today</span>
              <span className="aa-today__done-count">{doneCount}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDone((value) => !value)}
              aria-expanded={showDone}
            >
              {showDone ? "Hide" : "Show"}
            </Button>
          </div>
          {showDone && (
            <GroupedList
              groups={doneGroups}
              headingLevel={3}
              renderItem={(task) => (
                <TaskRow
                  as="div"
                  variant="list"
                  key={task.id}
                  task={task}
                  showLens={showLensPill}
                  muted
                  onOpen={() => editTask(task)}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFeedbackTask(task)}
                  >
                    Leave feedback
                  </Button>
                </TaskRow>
              )}
            />
          )}
        </section>
      )}
      {feedbackTask && (
        <FeedbackDialog
          onClose={() => setFeedbackTask(null)}
          onSubmit={async (message) => {
            await submitFeedback({
              message: `Done task feedback: ${feedbackTask.description}\n\n${message}`,
              ...captureFeedbackContext(location),
              lens: lens
                ? { id: lens.id, name: lens.name, color: lens.color }
                : null,
            });
          }}
        />
      )}
    </section>
  );
}
