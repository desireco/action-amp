import {
  buildReviewSlices,
  localDateFor,
  reviewPeriod,
  type ReviewCadence,
} from "./period";
import type {
  ReviewAnswers,
  ReviewGoalItem,
  ReviewGoalOption,
  ReviewProjectItem,
  ReviewResult,
  ReviewSnapshot,
  ReviewTaskItem,
} from "./types";

// Prisma delegate, Wasp entity map, or Vitest mock map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

export type ReviewArgs = {
  cadence: ReviewCadence;
  forDate: string;
  timeZone: string;
};

export type SaveReviewArgs = ReviewArgs & {
  answers: ReviewAnswers;
};

export async function getReviewData(
  entities: Entities,
  userId: string,
  args: ReviewArgs,
  now = new Date(),
): Promise<ReviewResult> {
  const period = reviewPeriod(args.cadence, args.forDate, args.timeZone, now);
  const [saved, liveEvidence, availableGoals] = await Promise.all([
    entities.Review.findUnique({
      where: {
        userId_cadence_periodStart: {
          userId,
          cadence: args.cadence,
          periodStart: period.start,
        },
      },
    }),
    loadEvidence(
      entities,
      userId,
      period.start,
      period.end,
      args.timeZone,
      now,
    ),
    loadAvailableGoals(entities, userId),
  ]);

  const savedSnapshot = parseSnapshot(saved?.snapshot);
  const useStableSnapshot = Boolean(
    args.cadence === "DAILY" &&
    saved?.completedAt &&
    !period.inProgress &&
    savedSnapshot,
  );
  const evidence = useStableSnapshot ? savedSnapshot! : liveEvidence;
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

export async function saveReviewDraftData(
  entities: Entities,
  userId: string,
  args: SaveReviewArgs,
) {
  const period = reviewPeriod(args.cadence, args.forDate, args.timeZone);
  const answers = validateAnswers(args.cadence, args.answers);
  return entities.Review.upsert({
    where: {
      userId_cadence_periodStart: {
        userId,
        cadence: args.cadence,
        periodStart: period.start,
      },
    },
    create: {
      userId,
      cadence: args.cadence,
      periodStart: period.start,
      periodEnd: period.end,
      timeZone: args.timeZone,
      answers,
    },
    update: {
      periodEnd: period.end,
      timeZone: args.timeZone,
      answers,
    },
    select: { id: true, updatedAt: true, completedAt: true },
  });
}

export async function completeReviewData(
  entities: Entities,
  userId: string,
  args: SaveReviewArgs,
  now = new Date(),
) {
  if (args.cadence !== "DAILY") {
    throw new Error("Only Today reviews can be closed.");
  }
  const period = reviewPeriod(args.cadence, args.forDate, args.timeZone, now);
  const answers = validateAnswers(args.cadence, args.answers);
  const snapshot = await loadEvidence(
    entities,
    userId,
    period.start,
    period.end,
    args.timeZone,
    now,
  );
  const completedAt = now;
  const review = await entities.Review.upsert({
    where: {
      userId_cadence_periodStart: {
        userId,
        cadence: args.cadence,
        periodStart: period.start,
      },
    },
    create: {
      userId,
      cadence: args.cadence,
      periodStart: period.start,
      periodEnd: period.end,
      timeZone: args.timeZone,
      answers,
      snapshot,
      completedAt,
    },
    update: {
      periodEnd: period.end,
      timeZone: args.timeZone,
      answers,
      snapshot,
      completedAt,
    },
    select: { id: true, updatedAt: true, completedAt: true },
  });
  return { ...review, snapshot };
}

async function loadEvidence(
  entities: Entities,
  userId: string,
  start: Date,
  end: Date,
  timeZone: string,
  now: Date,
): Promise<ReviewSnapshot> {
  const range = { gte: start, lt: end };
  const [tasks, projects, goals, sessions] = await Promise.all([
    entities.Task.findMany({
      where: { userId, isDone: true, completedAt: range },
      orderBy: { completedAt: "asc" },
      select: {
        id: true,
        description: true,
        permalink: true,
        outcome: true,
        size: true,
        completedAt: true,
        lens: { select: { id: true, name: true, color: true } },
        goal: { select: { id: true, name: true, permalink: true } },
        project: {
          select: {
            id: true,
            name: true,
            permalink: true,
            goal: { select: { id: true, name: true, permalink: true } },
          },
        },
      },
    }),
    entities.Project.findMany({
      where: { userId, isDone: true, completedAt: range },
      orderBy: { completedAt: "asc" },
      select: {
        id: true,
        name: true,
        permalink: true,
        description: true,
        completedAt: true,
        lens: { select: { id: true, name: true, color: true } },
        goal: { select: { id: true, name: true, permalink: true } },
      },
    }),
    entities.Goal.findMany({
      where: { userId, isDone: true, completedAt: range },
      orderBy: { completedAt: "asc" },
      select: {
        id: true,
        name: true,
        permalink: true,
        description: true,
        completedAt: true,
        lens: { select: { id: true, name: true, color: true } },
      },
    }),
    entities.TaskSession.findMany({
      where: {
        userId,
        startedAt: { lt: end },
        endedAt: { not: null, gt: start },
      },
      select: {
        startedAt: true,
        endedAt: true,
        task: { select: { lensId: true } },
      },
    }),
  ]);

  const taskItems: ReviewTaskItem[] = tasks.map((task: any) => ({
    id: task.id,
    title: task.description,
    permalink: task.permalink,
    outcome: task.outcome ?? null,
    size: task.size,
    completedAt: new Date(task.completedAt).toISOString(),
    lens: task.lens,
    project: task.project,
    goal: task.project?.goal ?? task.goal ?? null,
  }));
  const projectItems: ReviewProjectItem[] = projects.map((project: any) => ({
    id: project.id,
    name: project.name,
    permalink: project.permalink,
    description: project.description ?? null,
    completedAt: new Date(project.completedAt).toISOString(),
    lens: project.lens,
    goal: project.goal ?? null,
  }));
  const goalItems: ReviewGoalItem[] = goals.map((goal: any) => ({
    id: goal.id,
    name: goal.name,
    permalink: goal.permalink,
    description: goal.description ?? null,
    completedAt: new Date(goal.completedAt).toISOString(),
    lens: goal.lens,
  }));
  const focusMsByLens = new Map<string, number>();
  const focusMs = sessions.reduce((sum: number, session: any) => {
    if (!session.endedAt) return sum;
    const clippedStart = Math.max(
      start.getTime(),
      new Date(session.startedAt).getTime(),
    );
    const clippedEnd = Math.min(
      end.getTime(),
      new Date(session.endedAt).getTime(),
    );
    const duration = Math.max(0, clippedEnd - clippedStart);
    if (session.task?.lensId) {
      focusMsByLens.set(
        session.task.lensId,
        (focusMsByLens.get(session.task.lensId) ?? 0) + duration,
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
  entities: Entities,
  userId: string,
): Promise<ReviewGoalOption[]> {
  return entities.Goal.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      permalink: true,
      isDone: true,
      lens: { select: { id: true, name: true, color: true } },
    },
  });
}

export function validateAnswers(
  cadence: ReviewCadence,
  value: ReviewAnswers,
): ReviewAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Review answers must be an object.");
  }
  const allowed =
    cadence === "DAILY"
      ? ["howGoing", "goingWell", "challenges", "currentAttention", "memory"]
      : cadence === "WEEKLY"
        ? [
            "howGoing",
            "goingWell",
            "challenges",
            "currentAttention",
            "moved",
            "change",
          ]
        : [
            "howGoing",
            "goingWell",
            "challenges",
            "currentAttention",
            "proud",
            "learned",
            "attention",
            "emphasisGoalId",
          ];
  const clean: ReviewAnswers = {};
  for (const key of allowed) {
    const raw = value[key as keyof ReviewAnswers];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string")
      throw new Error("Review answers must contain text values.");
    const trimmed = raw.trim();
    if (trimmed.length > 4_000)
      throw new Error("Each review answer must be 4,000 characters or fewer.");
    if (trimmed) clean[key as keyof ReviewAnswers] = trimmed;
  }
  return clean;
}

function normalizeAnswers(value: unknown): ReviewAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const answers: ReviewAnswers = {};
  for (const key of [
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
  ] as const) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "string") answers[key] = raw;
  }
  return answers;
}

function parseSnapshot(value: unknown): ReviewSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<ReviewSnapshot>;
  if (
    record.version !== 1 ||
    !Array.isArray(record.tasks) ||
    !Array.isArray(record.projects) ||
    !Array.isArray(record.goals)
  )
    return null;
  return record as ReviewSnapshot;
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

function dateString(value: unknown): string | null {
  return value instanceof Date
    ? value.toISOString()
    : typeof value === "string"
      ? new Date(value).toISOString()
      : null;
}
