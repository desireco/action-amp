import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getTasks,
  getDoneToday,
  updateTaskStatus,
  submitFeedback,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  TaskRow,
  CompletionCircle,
  Chip,
  ConfirmDialog,
  type TaskRowTask,
} from "../components/ui";
import { GroupedList, type GroupDef } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { FeedbackDialog } from "../app/FeedbackDialog";
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
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "TODAY", isDone: false } : undefined,
    { enabled: !!lens },
  );
  // Upcoming bench: status=UPCOMING tasks in the active lens, surfaced when
  // the user swaps to pull one onto today. Fetched on mount so the closed
  // "See upcoming" control can show a count; otherwise rolled/bench tasks can
  // look like they disappeared when Today is empty.
  const [showUpcoming, setShowUpcoming] = useState(false);
  const { data: upcoming } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "UPCOMING", isDone: false } : undefined,
    { enabled: !!lens },
  );

  // Done-today: tasks completed since local midnight. Fetched on mount and
  // shown inline so completed work stays visible without another click.
  const [showDone, setShowDone] = useState(true);
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
    return Array.from(byGoal, ([name, items]) => ({
      key: name,
      label: name,
      items,
    }));
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
    return Array.from(byGoal, ([name, items]) => ({
      key: name,
      label: name,
      items,
    }));
  }, [doneToday]);

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
  const [feedbackTask, setFeedbackTask] = useState<TaskRowTask | null>(null);
  const [demoteTask, setDemoteTask] = useState<TaskRowTask | null>(null);

  const overCapacity = (tasks?.length ?? 0) > TODAY_CAP;
  const overflow = useMemo(() => (tasks ?? []).slice(TODAY_CAP), [tasks]);
  const committedCount = Math.min(tasks?.length ?? 0, TODAY_CAP);
  const upcomingCount = upcoming?.length ?? 0;
  const doneCount = doneToday?.length ?? 0;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const editTask = (task: TaskRowTask) => {
    navigate(`/app/tasks/${task.permalink ?? task.id}`, {
      state: { returnTo },
    });
  };
  const pickTask = (task: TaskRowTask) => {
    navigate(`/app/today/${encodeURIComponent(task.permalink ?? task.id)}`);
  };

  // Note: no early empty-state return — the header (with the See-upcoming
  // toggle) renders even when Today is empty, so the bench is always reachable.
  const isEmpty = !isLoading && (tasks?.length ?? 0) === 0;
  // Hero copy adapts to the surface (Today vs Upcoming bench) and to how full
  // Today is. The verb always matches the list the user is actually looking at.
  const heroEyebrow = showUpcoming ? "Today · Upcoming" : "Today";
  const heroTitle = showUpcoming
    ? `${upcomingCount} on the bench`
    : isLoading
      ? "—"
      : `${tasks?.length ?? 0} of ${TODAY_CAP} committed`;
  const heroSubtitle = showUpcoming
    ? "Pull one in to fill a slot on Today."
    : committedCount >= TODAY_CAP
      ? "Day's full. Finish one to make room."
      : "Keep the day small enough to finish.";

  return (
    <section className="aa-today" aria-label="Today">
      <header className="aa-list-header aa-today__hero">
        <div className="aa-today__hero-copy">
          <div className="aa-list-header__eyebrow">{heroEyebrow}</div>
          <h1 className="aa-list-header__title aa-today__title">{heroTitle}</h1>
          <p className="aa-today__subtitle">{heroSubtitle}</p>
          {/* The meter is a Today concept — hide it while the bench is open so
              the hero describes the surface the user is actually looking at. */}
          {!showUpcoming && (
            <div
              className="aa-today__meter"
              aria-label={`${committedCount} of ${TODAY_CAP} Today slots committed`}
            >
              {Array.from({ length: TODAY_CAP }, (_, i) => (
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
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowUpcoming((v) => !v)}
          aria-expanded={showUpcoming}
          aria-controls="aa-today-body"
        >
          {showUpcoming
            ? "Back to Today"
            : `See upcoming${upcomingCount > 0 ? ` ${upcomingCount}` : ""}`}
        </Button>
      </header>

      <div id="aa-today-body">
        {showUpcoming ? (
          // Upcoming bench: status=UPCOMING tasks in the active lens. Each row
          // has a "Today" control to promote it onto today. Empty state is calm
          // — nothing's been deferred, nothing to swap in.
          <section className="aa-today__upcoming" aria-label="Upcoming bench">
            <h2 className="aa-grouped__heading">Upcoming</h2>
            {upcomingCount === 0 ? (
              <p className="aa-today__upcoming-empty">
                Nothing on the bench. Snooze a task and it'll show up here.
              </p>
            ) : (
              <ul className="aa-grouped__list">
                {(upcoming ?? []).map((task) => (
                  <li key={task.id} className="aa-grouped__item">
                    <TaskRow
                      as="div"
                      variant="list"
                      task={task}
                      showContent
                      onOpen={() => editTask(task)}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePromote(task)}
                      >
                        Today
                      </Button>
                    </TaskRow>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : isLoading ? (
          // Skeleton: title row already rendered "—" above; show muted list
          // placeholders so the page doesn't snap in once data resolves.
          <div className="aa-today__loading" aria-hidden="true">
            <div className="aa-today__skeleton-group">
              <div className="aa-today__skeleton aa-today__skeleton--heading" />
              {[0, 1].map((i) => (
                <div key={i} className="aa-today__skeleton aa-today__skeleton--row" />
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
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowUpcoming(true)}
                >
                  See upcoming {upcomingCount}
                </Button>
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
                  beyond the cap of {TODAY_CAP}. Bump one to Upcoming or Someday
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
                  showContent
                  onOpen={() => {
                    pickTask(task);
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editTask(task)}
                    title="Edit task"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDemoteTask(task)}
                    title="Move back to Upcoming"
                  >
                    Move to Upcoming
                  </Button>
                </TaskRow>
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
                {overflow.map((task) => (
                  <li key={task.id} className="aa-grouped__item">
                    <TaskRow
                      as="div"
                      variant="list"
                      task={task}
                      muted
                      showContent
                      onOpen={() => {
                        pickTask(task);
                      }}
                    />
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
                  muted
                  showContent
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
              route: location.pathname,
              section: "work",
              lens: lens
                ? { id: lens.id, name: lens.name, color: lens.color }
                : null,
              userAgent:
                typeof navigator === "undefined" ? null : navigator.userAgent,
            });
          }}
        />
      )}
      {demoteTask && (
        <ConfirmDialog
          title="Move this off Today?"
          message={
            <>
              <strong>{demoteTask.description}</strong> will move to Upcoming.
              It stays available from the upcoming bench.
            </>
          }
          confirmLabel="Move to Upcoming"
          cancelLabel="Keep today"
          onClose={() => setDemoteTask(null)}
          onConfirm={async () => {
            const task = demoteTask;
            setDemoteTask(null);
            await handleDemote(task);
          }}
        />
      )}
    </section>
  );
}
