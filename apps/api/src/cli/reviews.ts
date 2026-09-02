/**
 * S18 — reviews core for `/api/cli/review`, ported from
 * `webapp/src/reviews/{period,types,report,operationsCore}.ts`.
 *
 * The pure modules (period math, report assembly, types) are verbatim — only
 * import specifiers changed. `getReviewData` keeps its signature and return
 * shape but speaks Drizzle directly for the five entity reads it makes
 * (Review row + Task/Project/Goal/TaskSession evidence): the domain seam has
 * no Review delegate yet, and this route is the new stack's first reviews
 * consumer. When the reviews surface grows an oRPC fragment, promote these
 * cores to `@actionamp/domain/reviews` verbatim (the queries below are the
 * delegate-call inventory).
 *
 * Only the read path the CLI needs is ported (getReviewData); the draft/
 * complete write cores stay webapp-side until a consumer exists.
 */
import { and, asc, eq, gt, gte, isNotNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DomainDb } from "@actionamp/domain/db";
import {
  goal as goalTable,
  lens as lensTable,
  project as projectTable,
  review as reviewTable,
  task as taskTable,
  taskSession as taskSessionTable,
} from "@actionamp/domain/db";
import {
  Temporal,
  calendarDayDifference,
  instantFrom,
  instantToDate,
  assertTimeZone as assertTemporalTimeZone,
  type Instant,
  type PlainDate,
} from "@actionamp/domain/shared/time";

// ----------------------------------------------------------------
// types.ts (verbatim shapes)
// ----------------------------------------------------------------

export type ReviewCadence = "DAILY" | "WEEKLY" | "MONTHLY";

export type ReviewAnswers = {
  howGoing?: string;
  goingWell?: string;
  challenges?: string;
  currentAttention?: string;
  memory?: string;
  moved?: string;
  change?: string;
  proud?: string;
  learned?: string;
  attention?: string;
  emphasisGoalId?: string;
};

export type ReviewLensRef = {
  id: string;
  name: string;
  color: string | null;
};

export type ReviewGoalRef = {
  id: string;
  name: string;
  permalink?: string;
};

export type ReviewProjectRef = {
  id: string;
  name: string;
  permalink?: string;
  goal?: ReviewGoalRef | null;
};

export type ReviewTaskItem = {
  id: string;
  title: string;
  permalink: string;
  outcome: string | null;
  size?: "S" | "M" | "L" | "XL";
  completedAt: string;
  lens: ReviewLensRef;
  project: ReviewProjectRef | null;
  goal: ReviewGoalRef | null;
};

export type ReviewProjectItem = {
  id: string;
  name: string;
  permalink: string;
  description: string | null;
  completedAt: string;
  lens: ReviewLensRef;
  goal: ReviewGoalRef | null;
};

export type ReviewGoalItem = {
  id: string;
  name: string;
  permalink: string;
  description: string | null;
  completedAt: string;
  lens: ReviewLensRef;
};

export type ReviewGoalOption = {
  id: string;
  name: string;
  permalink: string;
  lens: ReviewLensRef;
  isDone: boolean;
};

export type ReviewSnapshot = {
  version: 1;
  capturedAt: string;
  tasks: ReviewTaskItem[];
  projects: ReviewProjectItem[];
  goals: ReviewGoalItem[];
  focusMinutes: number;
  focusMinutesByLens?: Record<string, number>;
  weeklySlices: { startDate: string; completedTasks: number }[];
};

export type ReviewResult = {
  cadence: ReviewCadence;
  period: {
    start: string;
    end: string;
    startDate: string;
    endDate: string;
    label: string;
    inProgress: boolean;
  };
  answers: ReviewAnswers;
  completedAt: string | null;
  updatedAt: string | null;
  evidence: ReviewSnapshot;
  evidenceSource: "live" | "snapshot";
  newCompletionCount: number;
  availableGoals: ReviewGoalOption[];
};

// ----------------------------------------------------------------
// period.ts (verbatim)
// ----------------------------------------------------------------

export interface ReviewPeriod {
  cadence: ReviewCadence;
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  label: string;
  inProgress: boolean;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertTimeZone(timeZone: string): string {
  try {
    return assertTemporalTimeZone(timeZone);
  } catch {
    throw new Error("Time zone must be a valid IANA identifier.");
  }
}

export function parseCalendarDate(value: string): CalendarDate {
  if (!ISO_DATE.test(value)) throw new Error("Review date must use YYYY-MM-DD.");
  try {
    // The runtime Temporal global supports the overflow option; the domain
    // seam's minimal PlainDate.from declaration just doesn't carry it.
    const date = (
      Temporal.PlainDate.from as (
        value: string,
        opts?: { overflow: "reject" },
      ) => { year: number; month: number; day: number }
    )(value, { overflow: "reject" });
    return { year: date.year, month: date.month, day: date.day };
  } catch {
    throw new Error("Review date must be a real calendar date.");
  }
}

function plainDate(value: string): PlainDate {
  parseCalendarDate(value);
  return Temporal.PlainDate.from(value);
}

export function localDateFor(date: Date, timeZone: string): string {
  assertTimeZone(timeZone);
  return instantFrom(date).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function reviewPeriod(
  cadence: ReviewCadence,
  forDate: string,
  timeZone: string,
  now = new Date(),
): ReviewPeriod {
  assertTimeZone(timeZone);
  const selected = plainDate(forDate);
  const startCalendar = periodStart(cadence, selected);
  const nextCalendar = startCalendar.add(
    cadence === "DAILY"
      ? { days: 1 }
      : cadence === "WEEKLY"
        ? { weeks: 1 }
        : { months: 1 },
  );
  const endInclusiveCalendar = nextCalendar.subtract({ days: 1 });
  const startInstant = startCalendar.toZonedDateTime(timeZone).toInstant();
  const endInstant = nextCalendar.toZonedDateTime(timeZone).toInstant();
  const nowInstant: Instant = instantFrom(now);

  return {
    cadence,
    start: instantToDate(startInstant),
    end: instantToDate(endInstant),
    startDate: startCalendar.toString(),
    endDate: endInclusiveCalendar.toString(),
    label: periodLabel(cadence, startCalendar, endInclusiveCalendar, timeZone),
    inProgress:
      Temporal.Instant.compare(nowInstant, startInstant) >= 0 &&
      Temporal.Instant.compare(nowInstant, endInstant) < 0,
  };
}

export function shiftReviewDate(
  forDate: string,
  cadence: ReviewCadence,
  direction: -1 | 1,
): string {
  const selected = plainDate(forDate);
  if (cadence === "MONTHLY") {
    return selected.with({ day: 1 }).add({ months: direction }).toString();
  }
  return selected
    .add(cadence === "DAILY" ? { days: direction } : { weeks: direction })
    .toString();
}

export function buildReviewSlices(
  completedAt: string[],
  startDate: string,
  endDate: string,
  timeZone: string,
): { startDate: string; completedTasks: number }[] {
  assertTimeZone(timeZone);
  const start = plainDate(startDate);
  const end = plainDate(endDate);
  const starts: PlainDate[] = [];
  for (
    let cursor = start;
    Temporal.PlainDate.compare(cursor, end) <= 0;
    cursor = cursor.add({ weeks: 1 })
  ) {
    starts.push(cursor);
  }
  const counts = new Map(starts.map((date) => [date.toString(), 0]));
  for (const value of completedAt) {
    const taskDate = instantFrom(value)
      .toZonedDateTimeISO(timeZone)
      .toPlainDate();
    const elapsed = calendarDayDifference(start, taskDate);
    const key = starts[
      Math.min(starts.length - 1, Math.max(0, Math.floor(elapsed / 7)))
    ]?.toString();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([sliceStart, completedTasks]) => ({
    startDate: sliceStart,
    completedTasks,
  }));
}

function periodStart(cadence: ReviewCadence, selected: PlainDate): PlainDate {
  if (cadence === "DAILY") return selected;
  if (cadence === "MONTHLY") return selected.with({ day: 1 });
  return selected.subtract({ days: selected.dayOfWeek - 1 });
}

function periodLabel(
  cadence: ReviewCadence,
  start: PlainDate,
  endInclusive: PlainDate,
  timeZone: string,
): string {
  const startDate = instantToDate(start.toZonedDateTime(timeZone).toInstant());
  if (cadence === "DAILY") {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(startDate);
  }
  if (cadence === "MONTHLY") {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      month: "long",
      year: "numeric",
    }).format(startDate);
  }
  const startLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(startDate);
  const endDate = instantToDate(
    endInclusive.toZonedDateTime(timeZone).toInstant(),
  );
  const endLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(endDate);
  return `${startLabel} – ${endLabel}`;
}

// ----------------------------------------------------------------
// report.ts (verbatim)
// ----------------------------------------------------------------

export type ReviewLensCount = {
  lens: ReviewLensRef;
  count: number;
};

export type ReviewReport = {
  cadence: "WEEKLY" | "MONTHLY";
  state: "in_progress" | "finished";
  period: ReviewResult["period"];
  lensId: string | null;
  totals: {
    actions: number;
    projects: number;
    goals: number;
    focusMinutes: number;
  };
  actionsByLens: ReviewLensCount[];
  highlights: ReviewTaskItem[];
  tasks: ReviewTaskItem[];
  projects: ReviewProjectItem[];
  goals: ReviewGoalItem[];
  weeklySlices: { startDate: string; completedTasks: number }[];
  checkIn: Pick<
    ReviewAnswers,
    "howGoing" | "goingWell" | "challenges" | "currentAttention"
  >;
  reflection: ReviewAnswers;
  emphasisGoal: {
    id: string;
    name: string;
    permalink: string;
    lens: ReviewLensRef;
  } | null;
};

function compactAnswers<K extends keyof ReviewAnswers>(
  answers: ReviewAnswers,
  keys: K[],
): Pick<ReviewAnswers, K> {
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  return Object.fromEntries(
    keys.flatMap((key) =>
      answers[key] === undefined ? [] : [[key, answers[key]]],
    ),
  ) as Pick<ReviewAnswers, K>;
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

export function countActionsByLens(tasks: ReviewTaskItem[]): ReviewLensCount[] {
  const counts = new Map<string, ReviewLensCount>();
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

export function buildReviewReport(
  result: ReviewResult,
  timeZone: string,
  lensId: string | null = null,
): ReviewReport {
  if (result.cadence === "DAILY") {
    throw new Error("CLI reports support Week and Month reviews only.");
  }
  const tasks = lensId
    ? result.evidence.tasks.filter((item) => item.lens.id === lensId)
    : result.evidence.tasks;
  const projects = lensId
    ? result.evidence.projects.filter((item) => item.lens.id === lensId)
    : result.evidence.projects;
  const goals = lensId
    ? result.evidence.goals.filter((item) => item.lens.id === lensId)
    : result.evidence.goals;
  const focusMinutes = lensId
    ? (result.evidence.focusMinutesByLens?.[lensId] ?? 0)
    : result.evidence.focusMinutes;

  return {
    cadence: result.cadence,
    state: result.period.inProgress ? "in_progress" : "finished",
    period: result.period,
    lensId,
    totals: {
      actions: tasks.length,
      projects: projects.length,
      goals: goals.length,
      focusMinutes,
    },
    actionsByLens: countActionsByLens(tasks),
    highlights: selectSignificantActions(tasks),
    tasks,
    projects,
    goals,
    weeklySlices:
      result.cadence === "MONTHLY"
        ? buildReviewSlices(
            tasks.map((task) => task.completedAt),
            result.period.startDate,
            result.period.endDate,
            timeZone,
          )
        : [],
    checkIn: compactAnswers(result.answers, [
      "howGoing",
      "goingWell",
      "challenges",
      "currentAttention",
    ]),
    reflection: compactAnswers(
      result.answers,
      result.cadence === "WEEKLY"
        ? ["moved", "change"]
        : ["proud", "learned", "attention", "emphasisGoalId"],
    ),
    emphasisGoal:
      result.availableGoals.find(
        (goal) => goal.id === result.answers.emphasisGoalId,
      ) ?? null,
  };
}

// ----------------------------------------------------------------
// operationsCore.ts — getReviewData (reads via Drizzle)
// ----------------------------------------------------------------

/** The saved Review row (snapshot/answers are jsonb columns). */
interface ReviewRow {
  snapshot: unknown;
  answers: unknown;
  completedAt: Date | null;
  updatedAt: Date | null;
}

export type ReviewArgs = {
  cadence: ReviewCadence;
  forDate: string;
  timeZone: string;
};

/** Answer keys across all cadences (kept-when-present). */
const ANSWER_KEYS = [
  "howGoing",
  "goingWell",
  "challenges",
  "currentAttention",
  "memory",
  "moved",
  "change",
  "proud",
  "learned",
  "attention",
  "emphasisGoalId",
] as const;

function normalizeAnswers(value: unknown): ReviewAnswers {
  if (!(value instanceof Object) || Array.isArray(value)) return {};
  const answers: ReviewAnswers = {};
  for (const key of ANSWER_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    // Constructor identity: exact primitive-string test for JSON values.
    if (raw?.constructor === String) answers[key] = raw as string;
  }
  return answers;
}

function parseSnapshot(value: unknown): ReviewSnapshot | null {
  if (!(value instanceof Object) || Array.isArray(value)) return null;
  // SAFETY: shallow shape checked below (version + the three arrays); the
  // array element shapes were written by our own completeReviewData.
  const record = value as Partial<ReviewSnapshot>;
  if (
    record.version !== 1 ||
    !Array.isArray(record.tasks) ||
    !Array.isArray(record.projects) ||
    !Array.isArray(record.goals)
  )
    return null;
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  return record as ReviewSnapshot;
}

/** jsonb columns arrive as parsed values from Drizzle; a string form is
 *  tolerated the way Prisma's JsonValue could carry one. */
function parseJsonColumn(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

export async function getReviewData(
  db: DomainDb,
  userId: string,
  args: ReviewArgs,
  now = new Date(),
): Promise<ReviewResult> {
  const period = reviewPeriod(args.cadence, args.forDate, args.timeZone, now);
  const [savedRows, liveEvidence, availableGoals] = await Promise.all([
    db
      .select({
        snapshot: reviewTable.snapshot,
        answers: reviewTable.answers,
        completedAt: reviewTable.completedAt,
        updatedAt: reviewTable.updatedAt,
      })
      .from(reviewTable)
      .where(
        and(
          eq(reviewTable.userId, userId),
          eq(reviewTable.cadence, args.cadence),
          eq(reviewTable.periodStart, period.start),
        ),
      )
      .limit(1),
    loadEvidence(db, userId, period.start, period.end, args.timeZone, now),
    loadAvailableGoals(db, userId),
  ]);
  const saved: ReviewRow | null = savedRows[0]
    ? {
        snapshot: parseJsonColumn(savedRows[0].snapshot),
        answers: parseJsonColumn(savedRows[0].answers),
        completedAt: savedRows[0].completedAt,
        updatedAt: savedRows[0].updatedAt,
      }
    : null;

  const savedSnapshot = parseSnapshot(saved?.snapshot);
  const useStableSnapshot = Boolean(
    args.cadence === "DAILY" &&
    saved?.completedAt &&
    !period.inProgress &&
    savedSnapshot,
  );
  const evidence = useStableSnapshot && savedSnapshot ? savedSnapshot : liveEvidence;
  const newCompletionCount =
    args.cadence === "DAILY" && savedSnapshot && period.inProgress
      ? countNewCompletions(savedSnapshot, liveEvidence)
      : 0;

  return {
    cadence: args.cadence,
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      startDate: period.startDate,
      endDate: period.endDate,
      label: period.label,
      inProgress: period.inProgress,
    },
    answers: normalizeAnswers(saved?.answers),
    completedAt: dateString(saved?.completedAt),
    updatedAt: dateString(saved?.updatedAt),
    evidence,
    evidenceSource: useStableSnapshot ? "snapshot" : "live",
    newCompletionCount,
    availableGoals,
  };
}

async function loadEvidence(
  db: DomainDb,
  userId: string,
  start: Date,
  end: Date,
  timeZone: string,
  now: Date,
): Promise<ReviewSnapshot> {
  // The project's own goal — a second Goal-table join (task.goalId vs
  // project.goalId), the SQL-image of Prisma's nested
  // project: { select: { goal: … } } include.
  const projectGoal = alias(goalTable, "project_goal");

  const [tasks, projects, goals, sessions] = await Promise.all([
    db
      .select({
        id: taskTable.id,
        description: taskTable.description,
        permalink: taskTable.permalink,
        outcome: taskTable.outcome,
        size: taskTable.size,
        completedAt: taskTable.completedAt,
        lensId: lensTable.id,
        lensName: lensTable.name,
        lensColor: lensTable.color,
        goalId: goalTable.id,
        goalName: goalTable.name,
        goalPermalink: goalTable.permalink,
        projectId: projectTable.id,
        projectName: projectTable.name,
        projectPermalink: projectTable.permalink,
        projectGoalId: projectGoal.id,
        projectGoalName: projectGoal.name,
        projectGoalPermalink: projectGoal.permalink,
      })
      .from(taskTable)
      .innerJoin(lensTable, eq(taskTable.lensId, lensTable.id))
      .leftJoin(goalTable, eq(taskTable.goalId, goalTable.id))
      .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(projectGoal, eq(projectTable.goalId, projectGoal.id))
      .where(
        and(
          eq(taskTable.userId, userId),
          eq(taskTable.isDone, true),
          gte(taskTable.completedAt, start),
          lt(taskTable.completedAt, end),
        ),
      )
      .orderBy(asc(taskTable.completedAt)),
    db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        permalink: projectTable.permalink,
        description: projectTable.description,
        completedAt: projectTable.completedAt,
        lensId: lensTable.id,
        lensName: lensTable.name,
        lensColor: lensTable.color,
        goalId: goalTable.id,
        goalName: goalTable.name,
        goalPermalink: goalTable.permalink,
      })
      .from(projectTable)
      .innerJoin(lensTable, eq(projectTable.lensId, lensTable.id))
      .leftJoin(goalTable, eq(projectTable.goalId, goalTable.id))
      .where(
        and(
          eq(projectTable.userId, userId),
          eq(projectTable.isDone, true),
          gte(projectTable.completedAt, start),
          lt(projectTable.completedAt, end),
          eq(projectTable.type, "STANDARD"),
        ),
      )
      .orderBy(asc(projectTable.completedAt)),
    db
      .select({
        id: goalTable.id,
        name: goalTable.name,
        permalink: goalTable.permalink,
        description: goalTable.description,
        completedAt: goalTable.completedAt,
        isDone: goalTable.isDone,
        lensId: lensTable.id,
        lensName: lensTable.name,
        lensColor: lensTable.color,
      })
      .from(goalTable)
      .innerJoin(lensTable, eq(goalTable.lensId, lensTable.id))
      .where(
        and(
          eq(goalTable.userId, userId),
          eq(goalTable.isDone, true),
          gte(goalTable.completedAt, start),
          lt(goalTable.completedAt, end),
        ),
      )
      .orderBy(asc(goalTable.completedAt)),
    db
      .select({
        startedAt: taskSessionTable.startedAt,
        endedAt: taskSessionTable.endedAt,
        lensId: taskTable.lensId,
      })
      .from(taskSessionTable)
      .innerJoin(taskTable, eq(taskSessionTable.taskId, taskTable.id))
      .where(
        and(
          eq(taskSessionTable.userId, userId),
          lt(taskSessionTable.startedAt, end),
          isNotNull(taskSessionTable.endedAt),
          gt(taskSessionTable.endedAt, start),
        ),
      ),
  ]);

  const taskItems: ReviewTaskItem[] = tasks.map((task) => ({
    id: task.id,
    title: task.description,
    permalink: task.permalink,
    outcome: task.outcome ?? null,
    size: task.size,
    // Non-null: the evidence where-clause filters on a completedAt range.
    completedAt: new Date(task.completedAt!).toISOString(),
    lens: { id: task.lensId, name: task.lensName, color: task.lensColor },
    project: task.projectId
      ? {
          id: task.projectId,
          name: task.projectName!,
          permalink: task.projectPermalink!,
          goal: task.projectGoalId
            ? {
                id: task.projectGoalId,
                name: task.projectGoalName!,
                permalink: task.projectGoalPermalink!,
              }
            : null,
        }
      : null,
    goal: task.projectId
      ? task.projectGoalId
        ? {
            id: task.projectGoalId,
            name: task.projectGoalName!,
            permalink: task.projectGoalPermalink!,
          }
        : null
      : task.goalId
        ? {
            id: task.goalId,
            name: task.goalName!,
            permalink: task.goalPermalink!,
          }
        : null,
  }));
  const projectItems: ReviewProjectItem[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    permalink: project.permalink,
    description: project.description ?? null,
    completedAt: new Date(project.completedAt!).toISOString(),
    lens: { id: project.lensId, name: project.lensName, color: project.lensColor },
    goal: project.goalId
      ? {
          id: project.goalId,
          name: project.goalName!,
          permalink: project.goalPermalink!,
        }
      : null,
  }));
  const goalItems: ReviewGoalItem[] = goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    permalink: goal.permalink,
    description: goal.description ?? null,
    completedAt: new Date(goal.completedAt!).toISOString(),
    lens: { id: goal.lensId, name: goal.lensName, color: goal.lensColor },
  }));
  const focusMsByLens = new Map<string, number>();
  const periodStartInstant = instantFrom(start);
  const periodEndInstant = instantFrom(end);
  const focusMs = sessions.reduce((sum: number, session) => {
    if (!session.endedAt) return sum;
    const sessionStart = instantFrom(session.startedAt);
    const sessionEnd = instantFrom(session.endedAt);
    const clippedStart =
      Temporal.Instant.compare(periodStartInstant, sessionStart) >= 0
        ? periodStartInstant
        : sessionStart;
    const clippedEnd =
      Temporal.Instant.compare(periodEndInstant, sessionEnd) <= 0
        ? periodEndInstant
        : sessionEnd;
    const duration =
      Temporal.Instant.compare(clippedEnd, clippedStart) > 0
        ? // SAFETY: the runtime Duration carries total(); the seam's minimal
          // TemporalDuration interface declares data fields only.
          (
            clippedStart as unknown as {
              until(other: Instant): { total(unit: "milliseconds"): number };
            }
          )
            .until(clippedEnd)
            .total("milliseconds")
        : 0;
    if (session.lensId) {
      focusMsByLens.set(
        session.lensId,
        (focusMsByLens.get(session.lensId) ?? 0) + duration,
      );
    }
    return sum + duration;
  }, 0);

  return {
    version: 1,
    capturedAt: now.toISOString(),
    tasks: taskItems,
    projects: projectItems,
    goals: goalItems,
    focusMinutes: Math.round(focusMs / 60_000),
    focusMinutesByLens: Object.fromEntries(
      Array.from(focusMsByLens, ([lensId, milliseconds]) => [
        lensId,
        Math.round(milliseconds / 60_000),
      ]),
    ),
    weeklySlices: buildReviewSlices(
      taskItems.map((task) => task.completedAt),
      localDateFor(start, timeZone),
      addIsoDays(localDateFor(end, timeZone), -1),
      timeZone,
    ),
  };
}

async function loadAvailableGoals(
  db: DomainDb,
  userId: string,
): Promise<ReviewGoalOption[]> {
  const rows = await db
    .select({
      id: goalTable.id,
      name: goalTable.name,
      permalink: goalTable.permalink,
      isDone: goalTable.isDone,
      lensId: lensTable.id,
      lensName: lensTable.name,
      lensColor: lensTable.color,
    })
    .from(goalTable)
    .innerJoin(lensTable, eq(goalTable.lensId, lensTable.id))
    .where(eq(goalTable.userId, userId))
    .orderBy(asc(goalTable.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    permalink: row.permalink,
    isDone: row.isDone,
    lens: { id: row.lensId, name: row.lensName, color: row.lensColor },
  }));
}

function countNewCompletions(
  saved: ReviewSnapshot,
  live: ReviewSnapshot,
): number {
  const known = new Set([
    ...saved.tasks.map((item) => `task:${item.id}`),
    ...saved.projects.map((item) => `project:${item.id}`),
    ...saved.goals.map((item) => `goal:${item.id}`),
  ]);
  return [
    ...live.tasks.map((item) => `task:${item.id}`),
    ...live.projects.map((item) => `project:${item.id}`),
    ...live.goals.map((item) => `goal:${item.id}`),
  ].filter((key) => !known.has(key)).length;
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateString(value: Date | string | null | undefined): string | null {
  return value instanceof Date
    ? value.toISOString()
    : value !== undefined && value !== null
      ? new Date(value).toISOString()
      : null;
}
