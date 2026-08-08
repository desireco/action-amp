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
  ReviewOpenLoopDecision,
  ReviewProjectItem,
  ReviewResult,
  ReviewSnapshot,
  ReviewTaskDecision,
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
  const [
    saved,
    liveEvidence,
    availableGoals,
    taskDecisions,
    openLoopDecisions,
  ] = await Promise.all([
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
    args.cadence === "WEEKLY"
      ? loadTaskDecisions(entities, userId, now)
      : Promise.resolve([]),
    args.cadence === "MONTHLY"
      ? loadOpenLoopDecisions(entities, userId, period.start, period.end, now)
      : Promise.resolve([]),
  ]);

  const savedSnapshot = parseSnapshot(saved?.snapshot);
  const useStableSnapshot = Boolean(
    saved?.completedAt && !period.inProgress && savedSnapshot,
  );
  const evidence = useStableSnapshot ? savedSnapshot! : liveEvidence;
  const newCompletionCount =
    savedSnapshot && period.inProgress
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
    taskDecisions,
    openLoopDecisions,
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

async function loadTaskDecisions(
  entities: Entities,
  userId: string,
  now: Date,
): Promise<ReviewTaskDecision[]> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const tasks = await entities.Task.findMany({
    where: {
      userId,
      isDone: false,
      status: { in: ["TODAY", "UPCOMING"] },
      OR: [
        { dueDate: { lt: now } },
        { startedAt: { lt: sevenDaysAgo } },
        {
          status: "UPCOMING",
          createdAt: { lt: thirtyDaysAgo },
          updates: { none: {} },
          sessions: { none: {} },
        },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 12,
    select: {
      id: true,
      description: true,
      permalink: true,
      status: true,
      dueDate: true,
      startedAt: true,
      createdAt: true,
      lens: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, permalink: true } },
    },
  });

  return tasks
    .map((task: any) => ({
      id: task.id,
      title: task.description,
      permalink: task.permalink,
      status: task.status,
      reason:
        task.dueDate && new Date(task.dueDate) < now
          ? "Overdue"
          : task.startedAt && new Date(task.startedAt) < sevenDaysAgo
            ? "Interrupted"
            : "Quiet",
      lens: task.lens,
      project: task.project,
    }))
    .slice(0, 5);
}

async function loadOpenLoopDecisions(
  entities: Entities,
  userId: string,
  start: Date,
  end: Date,
  now: Date,
): Promise<ReviewOpenLoopDecision[]> {
  const range = { gte: start, lt: end };
  const [projects, goals] = await Promise.all([
    entities.Project.findMany({
      where: { userId, isDone: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 8,
      select: {
        id: true,
        name: true,
        permalink: true,
        dueDate: true,
        createdAt: true,
        lens: { select: { id: true, name: true, color: true } },
        tasks: {
          where: { isDone: true, completedAt: range },
          select: { id: true },
        },
      },
    }),
    entities.Goal.findMany({
      where: { userId, isDone: false },
      orderBy: { createdAt: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        permalink: true,
        createdAt: true,
        lens: { select: { id: true, name: true, color: true } },
        projects: {
          select: {
            completedAt: true,
            tasks: {
              where: { isDone: true, completedAt: range },
              select: { id: true },
            },
          },
        },
      },
    }),
  ]);

  const projectRows: ReviewOpenLoopDecision[] = projects
    .filter(
      (project: any) =>
        project.tasks.length === 0 ||
        (project.dueDate && new Date(project.dueDate) < now),
    )
    .map((project: any) => ({
      id: project.id,
      kind: "project" as const,
      name: project.name,
      permalink: project.permalink,
      reason:
        project.dueDate && new Date(project.dueDate) < now
          ? "Past its due date"
          : "No completed tasks this month",
      lens: project.lens,
    }));
  const goalRows: ReviewOpenLoopDecision[] = goals
    .filter(
      (goal: any) =>
        !goal.projects.some(
          (project: any) =>
            (project.completedAt &&
              new Date(project.completedAt) >= start &&
              new Date(project.completedAt) < end) ||
            project.tasks.length > 0,
        ),
    )
    .map((goal: any) => ({
      id: goal.id,
      kind: "goal" as const,
      name: goal.name,
      permalink: goal.permalink,
      reason: "No recorded movement this month",
      lens: goal.lens,
    }));

  return [...projectRows, ...goalRows].slice(0, 3);
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
      ? ["memory"]
      : cadence === "WEEKLY"
        ? ["moved", "change"]
        : ["proud", "learned", "attention", "emphasisGoalId"];
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
