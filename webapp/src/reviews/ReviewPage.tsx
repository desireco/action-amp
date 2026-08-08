import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import {
  completeReview,
  getAppData,
  getReview,
  saveReviewDraft,
  useQuery,
} from "wasp/client/operations";
import { BrandMark, Button, Chip, Markdown } from "../components/ui";
import {
  buildReviewSlices,
  localDateFor,
  shiftReviewDate,
  type ReviewCadence,
} from "./period";
import type {
  ReviewAnswers,
  ReviewGoalItem,
  ReviewGoalOption,
  ReviewProjectItem,
  ReviewResult,
  ReviewTaskItem,
} from "./types";
import "./ReviewPage.css";

export function firstReviewRoute(preferences: {
  today: boolean;
  week: boolean;
  month: boolean;
}): string {
  if (preferences.today) return "/app/review/today";
  if (preferences.week) return "/app/review/week";
  if (preferences.month) return "/app/review/month";
  return "/app/logbook";
}

type ReviewShortcut = "previous" | "next" | "edit" | "record" | "down" | "up";

export function reviewShortcutFor(
  key: string,
  editable: boolean,
  canRecord = true,
): ReviewShortcut | null {
  if (editable) return null;
  if (key === "[") return "previous";
  if (key === "]") return "next";
  const normalized = key.toLowerCase();
  if (normalized === "e") return "edit";
  if (normalized === "r" && canRecord) return "record";
  if (normalized === "j") return "down";
  if (normalized === "k") return "up";
  return null;
}

export function ReviewRedirectPage() {
  const { data, isLoading, error } = useQuery(getAppData, { lensId: null });
  if (isLoading) return <ReviewLoading />;
  if (error || !data)
    return (
      <ReviewError
        message={
          error instanceof Error ? error.message : "Could not open Review."
        }
        onCurrent={() => window.location.reload()}
      />
    );
  return <Navigate to={firstReviewRoute(data.reviewPreferences)} replace />;
}

export function TodayReviewPage() {
  return <ReviewPage cadence="DAILY" />;
}

export function WeekReviewPage() {
  return <ReviewPage cadence="WEEKLY" />;
}

export function MonthReviewPage() {
  return <ReviewPage cadence="MONTHLY" />;
}

function ReviewPage({ cadence }: { cadence: ReviewCadence }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const today = localDateFor(new Date(), timeZone);
  const forDate = searchParams.get("for") ?? today;
  const { data: appData, isLoading: appLoading } = useQuery(getAppData, {
    lensId: null,
  });
  const preferences = appData?.reviewPreferences;
  const enabled =
    cadence === "DAILY"
      ? preferences?.today
      : cadence === "WEEKLY"
        ? preferences?.week
        : preferences?.month;

  useEffect(() => {
    if (!appLoading && preferences && enabled === false) {
      navigate(firstReviewRoute(preferences), { replace: true });
    }
  }, [appLoading, enabled, navigate, preferences]);

  const query = useQuery(getReview, { cadence, forDate, timeZone });
  const data = query.data as ReviewResult | undefined;
  const [answers, setAnswers] = useState<ReviewAnswers>({});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lensFilter, setLensFilter] = useState("all");
  const [completing, setCompleting] = useState(false);
  const editRevision = useRef(0);
  const autosaveTimer = useRef<number | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const identity = data ? `${cadence}:${data.period.start}` : null;

  useEffect(
    () => () => {
      editRevision.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (!identity || !data) return;
    setAnswers(data.answers ?? {});
    setDirty(false);
    setSaveState("idle");
    setLensFilter("all");
    editRevision.current += 1;
  }, [identity]);

  useEffect(() => {
    if (!dirty || !data) return;
    const revision = editRevision.current;
    autosaveTimer.current = window.setTimeout(() => {
      setSaveState("saving");
      setSaveError(null);
      const save = saveChain.current
        .catch(() => undefined)
        .then(() => saveReviewDraft({ cadence, forDate, timeZone, answers }));
      saveChain.current = save;
      void save.then(
        () => {
          if (revision !== editRevision.current) return;
          setDirty(false);
          setSaveState("saved");
        },
        (error) => {
          if (revision !== editRevision.current) return;
          setSaveState("error");
          setSaveError(
            error instanceof Error ? error.message : "Could not save review.",
          );
        },
      );
    }, 700);
    return () => {
      if (autosaveTimer.current !== null)
        window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    };
  }, [answers, cadence, data, dirty, forDate, timeZone]);

  function updateAnswer(key: keyof ReviewAnswers, value: string) {
    editRevision.current += 1;
    setAnswers((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setSaveState("idle");
  }

  function movePeriod(direction: -1 | 1) {
    const next = shiftReviewDate(forDate, cadence, direction);
    setSearchParams({ for: next });
  }

  async function finishReview() {
    if (cadence !== "DAILY" || completing) return;
    setCompleting(true);
    setSaveError(null);
    editRevision.current += 1;
    if (autosaveTimer.current !== null)
      window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = null;
    setDirty(false);
    try {
      await saveChain.current.catch(() => undefined);
      await completeReview({ cadence, forDate, timeZone, answers });
      setSaveState("saved");
      await query.refetch();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not complete review.",
      );
    } finally {
      setCompleting(false);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const action = reviewShortcutFor(
        event.key,
        Boolean(
          target?.matches("input, textarea, select, [contenteditable='true']"),
        ),
        cadence === "DAILY",
      );
      if (!action || !data || enabled === false) return;
      if (action === "previous") {
        event.preventDefault();
        movePeriod(-1);
      } else if (action === "next") {
        event.preventDefault();
        movePeriod(1);
      } else if (action === "edit") {
        event.preventDefault();
        document
          .querySelector<HTMLTextAreaElement>(".aa-review textarea")
          ?.focus();
      } else if (action === "record") {
        event.preventDefault();
        void finishReview();
      } else {
        const stops = Array.from(
          document.querySelectorAll<HTMLElement>("[data-review-stop]"),
        );
        if (stops.length === 0) return;
        event.preventDefault();
        const current = stops.findIndex(
          (stop) => stop === document.activeElement,
        );
        const delta = action === "down" ? 1 : -1;
        const next = stops[(current + delta + stops.length) % stops.length];
        next?.focus();
        next?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answers, cadence, completing, data, enabled, forDate, timeZone]);

  if (appLoading || query.isLoading) return <ReviewLoading />;
  if (query.error || !data) {
    return (
      <ReviewError
        message={
          query.error instanceof Error
            ? query.error.message
            : "Could not prepare this review."
        }
        onCurrent={() => setSearchParams({ for: today })}
      />
    );
  }

  const cadenceName =
    cadence === "DAILY" ? "Today" : cadence === "WEEKLY" ? "Week" : "Month";
  const evidence = data.evidence;
  const lensOptions = Array.from(
    new Map([
      ...evidence.tasks.map((item) => [item.lens.id, item.lens] as const),
      ...evidence.projects.map((item) => [item.lens.id, item.lens] as const),
      ...evidence.goals.map((item) => [item.lens.id, item.lens] as const),
    ]).values(),
  );
  const visibleEvidence =
    lensFilter === "all"
      ? evidence
      : {
          ...evidence,
          tasks: evidence.tasks.filter((item) => item.lens.id === lensFilter),
          projects: evidence.projects.filter(
            (item) => item.lens.id === lensFilter,
          ),
          goals: evidence.goals.filter((item) => item.lens.id === lensFilter),
        };
  const visibleFocusMinutes =
    lensFilter === "all"
      ? evidence.focusMinutes
      : (evidence.focusMinutesByLens?.[lensFilter] ?? 0);
  const visibleWeeklySlices =
    lensFilter === "all"
      ? evidence.weeklySlices
      : buildReviewSlices(
          visibleEvidence.tasks.map((task) => task.completedAt),
          data.period.startDate,
          data.period.endDate,
          timeZone,
        );
  const totalCompleted =
    visibleEvidence.tasks.length +
    visibleEvidence.projects.length +
    visibleEvidence.goals.length;

  return (
    <main className="aa-review" aria-labelledby="review-title">
      <header className="aa-review__header">
        <div>
          <div className="aa-review__eyebrow">Review · {cadenceName}</div>
          <h1 id="review-title">{data.period.label}</h1>
          <div className="aa-review__status-line">
            {data.period.inProgress && (
              <Chip variant="muted" small>
                In progress
              </Chip>
            )}
            {cadence === "DAILY" && data.completedAt && (
              <Chip variant="teal" small>
                Reviewed
              </Chip>
            )}
            {data.evidenceSource === "snapshot" && <span>Recorded view</span>}
            {saveState === "saving" && <span>Saving…</span>}
            {saveState === "saved" && <span>Saved</span>}
          </div>
        </div>
        <div className="aa-review__period-nav" aria-label="Review period">
          <button
            type="button"
            onClick={() => movePeriod(-1)}
            aria-label="Previous period"
          >
            ‹
          </button>
          <button type="button" onClick={() => setSearchParams({ for: today })}>
            Current
          </button>
          <button
            type="button"
            onClick={() => movePeriod(1)}
            aria-label="Next period"
          >
            ›
          </button>
        </div>
      </header>

      {cadence !== "DAILY" && lensOptions.length > 1 && (
        <label className="aa-review__lens-filter">
          <span>Show</span>
          <select
            value={lensFilter}
            onChange={(event) => setLensFilter(event.target.value)}
          >
            <option value="all">All lenses</option>
            {lensOptions.map((lens) => (
              <option key={lens.id} value={lens.id}>
                {lens.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {data.newCompletionCount > 0 && (
        <div className="aa-review__new" role="status">
          {data.newCompletionCount} new{" "}
          {data.newCompletionCount === 1 ? "completion" : "completions"} since
          this review. Updating keeps your reflection.
        </div>
      )}

      <GoalCelebration
        goals={visibleEvidence.goals}
        projects={visibleEvidence.projects}
        tasks={visibleEvidence.tasks}
        cadence={cadence}
      />
      <ProjectCelebration projects={visibleEvidence.projects} />

      {cadence !== "DAILY" && (
        <>
          <SignificantActions
            tasks={selectSignificantActions(visibleEvidence.tasks)}
            cadence={cadence}
          />
          <ActionCountsByLens tasks={visibleEvidence.tasks} />
        </>
      )}

      <section
        className="aa-review__section"
        aria-labelledby="completed-heading"
      >
        <SectionHeading
          id="completed-heading"
          title={
            cadence === "DAILY"
              ? "Tasks completed"
              : cadence === "WEEKLY"
                ? "What moved"
                : "Progress by goal"
          }
          detail={`${visibleEvidence.tasks.length} ${visibleEvidence.tasks.length === 1 ? "task" : "tasks"}`}
        />
        {visibleEvidence.tasks.length > 0 ? (
          <TaskEvidence tasks={visibleEvidence.tasks} cadence={cadence} />
        ) : (
          <p className="aa-review__empty">
            {cadence === "DAILY"
              ? "Nothing completed today. You can still leave a note and close the day."
              : `No completed work recorded for this ${cadence === "WEEKLY" ? "week" : "month"}.`}
          </p>
        )}
      </section>

      {cadence !== "DAILY" && (
        <section className="aa-review__section" aria-labelledby="shape-heading">
          <SectionHeading
            id="shape-heading"
            title={cadence === "WEEKLY" ? "Effort shape" : "Month shape"}
          />
          {cadence === "WEEKLY" ? (
            <div className="aa-review__metrics">
              <Metric
                value={String(visibleEvidence.tasks.length)}
                label="tasks completed"
              />
              <Metric
                value={String(visibleEvidence.projects.length)}
                label="projects completed"
              />
              {visibleFocusMinutes > 0 && (
                <Metric
                  value={formatMinutes(visibleFocusMinutes)}
                  label="recorded focus"
                />
              )}
            </div>
          ) : (
            <div className="aa-review__slices">
              {visibleWeeklySlices.map((slice) => (
                <div key={slice.startDate} className="aa-review__slice">
                  <span>Week of {formatShortDate(slice.startDate)}</span>
                  <strong>{slice.completedTasks}</strong>
                  <span>{slice.completedTasks === 1 ? "task" : "tasks"}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Reflection
        cadence={cadence}
        answers={answers}
        goals={data.availableGoals}
        onChange={updateAnswer}
      />

      {cadence === "DAILY" && (
        <footer className="aa-review__finish">
          <div>
            <strong>
              {totalCompleted > 0
                ? `${totalCompleted} accomplishments recorded.`
                : "Reflection is enough."}
            </strong>
            <span>No score. No streak. This review is yours.</span>
          </div>
          <Button onClick={() => void finishReview()} disabled={completing}>
            {completing
              ? "Recording"
              : data.completedAt
                ? "Update review"
                : "Close today"}
          </Button>
        </footer>
      )}
      {saveError && (
        <p className="aa-review__error" role="alert">
          {saveError}
        </p>
      )}
    </main>
  );
}

function GoalCelebration({
  goals,
  projects,
  tasks,
  cadence,
}: {
  goals: ReviewGoalItem[];
  projects: ReviewProjectItem[];
  tasks: ReviewTaskItem[];
  cadence: ReviewCadence;
}) {
  if (goals.length === 0) return null;
  return (
    <section className="aa-review__goals" aria-label="Completed goals">
      <span className="aa-review__celebration-label">
        {goals.length === 1 ? "A goal landed" : `${goals.length} goals landed`}
      </span>
      <div className="aa-review__goal-grid">
        {goals.map((goal) => (
          <article
            key={goal.id}
            className="aa-review__goal-card"
            tabIndex={0}
            data-review-stop
          >
            <BrandMark size={cadence === "MONTHLY" ? "md" : "sm"} />
            <div>
              <Link to={`/app/goals/${goal.permalink}`}>{goal.name}</Link>
              {goal.description && <p>{goal.description}</p>}
              <span>
                {goal.lens.name}
                {cadence === "MONTHLY" &&
                  ` · ${projects.filter((project) => project.goal?.id === goal.id).length} projects · ${tasks.filter((task) => task.goal?.id === goal.id).length} tasks`}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProjectCelebration({ projects }: { projects: ReviewProjectItem[] }) {
  if (projects.length === 0) return null;
  return (
    <section
      className="aa-review__section"
      aria-labelledby="projects-completed-heading"
    >
      <SectionHeading
        id="projects-completed-heading"
        title="Projects completed"
        detail={String(projects.length)}
      />
      <div className="aa-review__project-grid">
        {projects.map((project) => (
          <Link
            key={project.id}
            to={`/app/projects/${project.permalink}`}
            className="aa-review__project-card"
            data-review-stop
          >
            <BrandMark size="sm" />
            <span>{project.name}</span>
            <small>{project.goal?.name ?? project.lens.name}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function TaskEvidence({
  tasks,
  cadence,
}: {
  tasks: ReviewTaskItem[];
  cadence: ReviewCadence;
}) {
  const groups = useMemo(() => groupTasks(tasks, cadence), [cadence, tasks]);
  return (
    <div className="aa-review__task-groups">
      {groups.map((group) => (
        <details
          key={group.key}
          className={
            group.aligned ? undefined : "aa-review__task-group--unaligned"
          }
          open={groups.length <= 4 || group.tasks.length <= 8}
        >
          <summary data-review-stop tabIndex={0}>
            <span>{group.label}</span>
            <span>{group.tasks.length}</span>
          </summary>
          <ul>
            {group.tasks.map((task) => (
              <li key={task.id}>
                <span className="aa-review__task-mark" aria-hidden="true">
                  <BrandMark size="sm" />
                </span>
                <div>
                  <Link to={`/app/tasks/${task.permalink}`} data-review-stop>
                    {task.title}
                  </Link>
                  <div className="aa-review__task-meta">
                    <span>{task.lens.name}</span>
                    <span>{formatCompletion(task.completedAt, cadence)}</span>
                  </div>
                  {task.outcome && (
                    <div className="aa-review__outcome">
                      <Markdown>{task.outcome}</Markdown>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

export function selectSignificantActions(
  tasks: ReviewTaskItem[],
): ReviewTaskItem[] {
  const sizeRank = { L: 0, M: 1 } as const;
  return tasks
    .filter(
      (task): task is ReviewTaskItem & { size: "L" | "M" } =>
        task.size === "L" || task.size === "M",
    )
    .sort(
      (left, right) =>
        sizeRank[left.size] - sizeRank[right.size] ||
        Date.parse(right.completedAt) - Date.parse(left.completedAt),
    )
    .slice(0, 5);
}

export function countActionsByLens(tasks: ReviewTaskItem[]) {
  const counts = new Map<
    string,
    { lens: ReviewTaskItem["lens"]; count: number }
  >();
  for (const task of tasks) {
    const current = counts.get(task.lens.id);
    counts.set(task.lens.id, {
      lens: task.lens,
      count: (current?.count ?? 0) + 1,
    });
  }
  return Array.from(counts.values()).sort(
    (left, right) =>
      right.count - left.count || left.lens.name.localeCompare(right.lens.name),
  );
}

export function ActionCountsByLens({ tasks }: { tasks: ReviewTaskItem[] }) {
  const counts = countActionsByLens(tasks);
  if (counts.length === 0) return null;
  return (
    <section
      className="aa-review__section"
      aria-labelledby="actions-by-lens-heading"
    >
      <SectionHeading
        id="actions-by-lens-heading"
        title="Completed actions by lens"
      />
      <div className="aa-review__lens-counts">
        {counts.map(({ lens, count }) => (
          <div key={lens.id} className="aa-review__lens-count">
            <strong>{count}</strong>
            <span>{lens.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SignificantActions({
  tasks,
  cadence,
}: {
  tasks: ReviewTaskItem[];
  cadence: ReviewCadence;
}) {
  if (tasks.length === 0) return null;
  return (
    <section
      className="aa-review__section"
      aria-labelledby="significant-actions-heading"
    >
      <SectionHeading
        id="significant-actions-heading"
        title="Actions completed"
        detail="Up to 5 Medium or Large"
      />
      <div className="aa-review__highlights">
        {tasks.map((task) => (
          <article
            key={task.id}
            className="aa-review__highlight"
            tabIndex={0}
            data-review-stop
          >
            <Chip variant="muted" small>
              {task.size === "L" ? "Large" : "Medium"}
            </Chip>
            <div>
              <Link to={`/app/tasks/${task.permalink}`}>{task.title}</Link>
              <span>
                {task.project?.name ?? task.goal?.name ?? task.lens.name} ·{" "}
                {formatCompletion(task.completedAt, cadence)}
              </span>
              {task.outcome && (
                <div className="aa-review__outcome">
                  <Markdown>{task.outcome}</Markdown>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Reflection({
  cadence,
  answers,
  goals,
  onChange,
}: {
  cadence: ReviewCadence;
  answers: ReviewAnswers;
  goals: ReviewGoalOption[];
  onChange: (key: keyof ReviewAnswers, value: string) => void;
}) {
  const fields =
    cadence === "DAILY"
      ? [
          {
            key: "memory" as const,
            label: "What do you want to remember from today?",
          },
        ]
      : cadence === "WEEKLY"
        ? [
            { key: "moved" as const, label: "What moved forward?" },
            { key: "change" as const, label: "What should change next week?" },
          ]
        : [
            { key: "proud" as const, label: "What are you proud of?" },
            {
              key: "learned" as const,
              label: "What did this month teach you?",
            },
            {
              key: "attention" as const,
              label: "What deserves attention next month?",
            },
          ];
  const emphasisGoals = goals.filter(
    (goal) => !goal.isDone || goal.id === answers.emphasisGoalId,
  );
  return (
    <section
      className="aa-review__section aa-review__reflection"
      aria-labelledby="reflection-heading"
    >
      <SectionHeading
        id="reflection-heading"
        title="Reflection"
        detail="Optional · autosaves"
      />
      {fields.map((field) => (
        <label key={field.key}>
          <span>{field.label}</span>
          <textarea
            rows={3}
            value={answers[field.key] ?? ""}
            onChange={(event) => onChange(field.key, event.target.value)}
            maxLength={4_000}
          />
        </label>
      ))}
      {cadence === "MONTHLY" && emphasisGoals.length > 0 && (
        <label>
          <span>
            Goal to emphasize next month <small>Optional reflection only</small>
          </span>
          <select
            value={answers.emphasisGoalId ?? ""}
            onChange={(event) => onChange("emphasisGoalId", event.target.value)}
          >
            <option value="">No selection</option>
            {emphasisGoals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

function SectionHeading({
  id,
  title,
  detail,
}: {
  id: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="aa-review__section-heading">
      <h2 id={id}>{title}</h2>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="aa-review__metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReviewLoading() {
  return (
    <div className="aa-review aa-review--loading" aria-busy="true">
      <span>Preparing review…</span>
    </div>
  );
}

function ReviewError({
  message,
  onCurrent,
}: {
  message: string;
  onCurrent: () => void;
}) {
  return (
    <div className="aa-review aa-review--loading" role="alert">
      <div>
        <p>{message}</p>
        <Button onClick={onCurrent}>Open current review</Button>
      </div>
    </div>
  );
}

function groupTasks(tasks: ReviewTaskItem[], cadence: ReviewCadence) {
  const groups = new Map<
    string,
    { key: string; label: string; aligned: boolean; tasks: ReviewTaskItem[] }
  >();
  for (const task of tasks) {
    const label = taskGroupLabel(task, cadence);
    const key = `${task.lens.id}:${task.goal?.id ?? "none"}:${task.project?.id ?? "general"}`;
    const group = groups.get(key) ?? {
      key,
      label,
      aligned: Boolean(task.goal),
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(key, group);
  }
  const result = Array.from(groups.values());
  return cadence === "MONTHLY"
    ? result.sort(
        (a, b) =>
          Number(b.aligned) - Number(a.aligned) ||
          b.tasks.length - a.tasks.length,
      )
    : result;
}

function taskGroupLabel(task: ReviewTaskItem, cadence: ReviewCadence): string {
  const project = task.project?.name ?? "General";
  return cadence === "DAILY"
    ? `${task.lens.name} · ${project}`
    : `${task.goal?.name ?? "No goal"} · ${project}`;
}

function formatCompletion(value: string, cadence: ReviewCadence) {
  const date = new Date(value);
  return cadence === "DAILY"
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
}

function formatShortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
