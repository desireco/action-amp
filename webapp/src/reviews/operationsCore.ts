import {
  buildReviewSlices,
  localDateFor,
  reviewPeriod,
  type ReviewCadence,
} from "./period";
import type { Prisma, Size } from "@prisma/client";
import type {
  ReviewAnswers,
  ReviewGoalItem,
  ReviewGoalOption,
  ReviewGoalRef,
  ReviewLensRef,
  ReviewProjectItem,
  ReviewResult,
  ReviewSnapshot,
  ReviewTaskItem,
} from "./types";
import { Temporal, instantFrom } from "../shared/time/temporal";

/** A saved Review row (snapshot/answers are Prisma JSON columns). */
interface ReviewRow {
  snapshot: Prisma.JsonValue | null;
  answers: Prisma.JsonValue | null;
  completedAt: Date | null;
  updatedAt: Date | null;
}

/** Task rows the evidence select returns. */
interface EvidenceTaskRow {
  id: string;
  description: string;
  permalink: string;
  outcome: string | null;
  size: Size;
  completedAt: Date | null;
  lens: ReviewLensRef;
  goal: ReviewGoalRef | null;
  project: {
    id: string;
    name: string;
    permalink: string;
    goal: ReviewGoalRef | null;
  } | null;
}

/** Project rows the evidence select returns. */
interface EvidenceProjectRow {
  id: string;
  name: string;
  permalink: string;
  description: string | null;
  completedAt: Date | null;
  lens: ReviewLensRef;
  goal: ReviewGoalRef | null;
}

/** Goal rows the shared Goal select returns (evidence reads + picker options
 *  use the same select so the delegate keeps one honest signature). */
interface GoalListRow {
  id: string;
  name: string;
  permalink: string;
  description: string | null;
  completedAt: Date | null;
  isDone: boolean;
  lens: ReviewLensRef;
}

/** Focus-session rows the evidence select returns. */
interface FocusSessionRow {
  startedAt: Date;
  endedAt: Date | null;
  task: { lensId: string } | null;
}

/** The one Goal select both review queries use (evidence + picker options). */
const GOAL_LIST_SELECT = {
  id: true,
  name: true,
  permalink: true,
  description: true,
  completedAt: true,
  isDone: true,
  lens: { select: { id: true, name: true, color: true } },
} as const;

/**
 * The Prisma-delegate slices these cores call, split per function so each op
 * demands only the entities its Wasp route injects (named, not a loose map):
 * Wasp's per-op entities, the PAT route's shared client, and the Vitest
 * factory all satisfy the relevant slice structurally.
 */

/** Evidence loading (getReviewData, completeReviewData). */
interface EvidenceEntities {
  Task: {
    findMany(args: {
      where: {
        userId: string;
        isDone: true;
        completedAt: { gte: Date; lt: Date };
      };
      orderBy: { completedAt: "asc" };
      select: {
        id: true;
        description: true;
        permalink: true;
        outcome: true;
        size: true;
        completedAt: true;
        lens: { select: { id: true; name: true; color: true } };
        goal: { select: { id: true; name: true; permalink: true } };
        project: {
          select: {
            id: true;
            name: true;
            permalink: true;
            goal: { select: { id: true; name: true; permalink: true } };
          };
        };
      };
    }): Promise<EvidenceTaskRow[]>;
  };
  Project: {
    findMany(args: {
      where: {
        userId: string;
        isDone: true;
        completedAt: { gte: Date; lt: Date };
        type?: "STANDARD" | "SIMPLE_LIST";
      };
      orderBy: { completedAt: "asc" };
      select: {
        id: true;
        name: true;
        permalink: true;
        description: true;
        completedAt: true;
        lens: { select: { id: true; name: true; color: true } };
        goal: { select: { id: true; name: true; permalink: true } };
      };
    }): Promise<EvidenceProjectRow[]>;
  };
  Goal: {
    findMany(args: {
      where: {
        userId: string;
        isDone?: true;
        completedAt?: { gte: Date; lt: Date };
      };
      orderBy: { completedAt: "asc" } | { createdAt: "asc" };
      select: {
        id: true;
        name: true;
        permalink: true;
        description: true;
        completedAt: true;
        isDone: true;
        lens: { select: { id: true; name: true; color: true } };
      };
    }): Promise<GoalListRow[]>;
  };
  TaskSession: {
    findMany(args: {
      where: {
        userId: string;
        startedAt: { lt: Date };
        endedAt: { not: null; gt: Date };
      };
      select: {
        startedAt: true;
        endedAt: true;
        task: { select: { lensId: true } };
      };
    }): Promise<FocusSessionRow[]>;
  };
}

/** The saved-Review slice (findUnique for reads, upsert for writes). */
interface ReviewStore {
  Review: {
    findUnique(args: {
      where: {
        userId_cadence_periodStart: {
          userId: string;
          cadence: ReviewCadence;
          periodStart: Date;
        };
      };
    }): Promise<ReviewRow | null>;
    upsert(args: {
      where: {
        userId_cadence_periodStart: {
          userId: string;
          cadence: ReviewCadence;
          periodStart: Date;
        };
      };
      create: {
        userId: string;
        cadence: ReviewCadence;
        periodStart: Date;
        periodEnd: Date;
        timeZone: string;
        answers: ReviewAnswers;
        snapshot?: ReviewSnapshot;
        completedAt?: Date;
      };
      update: {
        periodEnd: Date;
        timeZone: string;
        answers: ReviewAnswers;
        snapshot?: ReviewSnapshot;
        completedAt?: Date;
      };
      select: { id: true; updatedAt: true; completedAt: true };
    }): Promise<{ id: string; updatedAt: Date; completedAt: Date | null }>;
  };
}

/** Everything getReviewData needs (evidence + the saved row). */
type ReviewReadEntities = EvidenceEntities & ReviewStore;
/** Everything completeReviewData needs (evidence + writes). */
type ReviewWriteEntities = EvidenceEntities & ReviewStore;
/** saveReviewDraftData writes only. */
type ReviewDraftEntities = ReviewStore;

export type ReviewArgs = {
  cadence: ReviewCadence;
  forDate: string;
  timeZone: string;
};

export type SaveReviewArgs = ReviewArgs & {
  answers: ReviewAnswers;
};

export async function getReviewData(
  entities: ReviewReadEntities,
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
  entities: ReviewDraftEntities,
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
  entities: ReviewWriteEntities,
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
  entities: EvidenceEntities,
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
      where: { userId, isDone: true, completedAt: range, type: "STANDARD" },
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
      select: GOAL_LIST_SELECT,
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

  const taskItems: ReviewTaskItem[] = tasks.map((task) => ({
    id: task.id,
    title: task.description,
    permalink: task.permalink,
    outcome: task.outcome ?? null,
    size: task.size,
    // Non-null: the evidence where-clause filters on a completedAt range.
    completedAt: new Date(task.completedAt!).toISOString(),
    lens: task.lens,
    project: task.project,
    goal: task.project?.goal ?? task.goal ?? null,
  }));
  const projectItems: ReviewProjectItem[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    permalink: project.permalink,
    description: project.description ?? null,
    completedAt: new Date(project.completedAt!).toISOString(),
    lens: project.lens,
    goal: project.goal ?? null,
  }));
  const goalItems: ReviewGoalItem[] = goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    permalink: goal.permalink,
    description: goal.description ?? null,
    completedAt: new Date(goal.completedAt!).toISOString(),
    lens: goal.lens,
  }));
  const focusMsByLens = new Map<string, number>();
  const periodStart = instantFrom(start);
  const periodEnd = instantFrom(end);
  const focusMs = sessions.reduce((sum: number, session) => {
    if (!session.endedAt) return sum;
    const sessionStart = instantFrom(session.startedAt);
    const sessionEnd = instantFrom(session.endedAt);
    const clippedStart =
      Temporal.Instant.compare(periodStart, sessionStart) >= 0
        ? periodStart
        : sessionStart;
    const clippedEnd =
      Temporal.Instant.compare(periodEnd, sessionEnd) <= 0
        ? periodEnd
        : sessionEnd;
    const duration =
      Temporal.Instant.compare(clippedEnd, clippedStart) > 0
        ? clippedStart.until(clippedEnd).total("milliseconds")
        : 0;
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
  entities: EvidenceEntities,
  userId: string,
): Promise<ReviewGoalOption[]> {
  return entities.Goal.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: GOAL_LIST_SELECT,
  });
}

export function validateAnswers(
  cadence: ReviewCadence,
  value: ReviewAnswers,
): ReviewAnswers {
  // Runtime defense for op-layer input the type system can't vouch for:
  // arrays/null slip through Wasp's arg typing. instanceof + isArray is
  // exact for JSON-decoded values.
  if (!value || !(value instanceof Object) || Array.isArray(value)) {
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
    // SAFETY: narrowing from string to keyof union member.
    const raw = value[key as keyof ReviewAnswers];
    if (raw === undefined || raw === null) continue;
    // Constructor identity: exact string test for JSON-decoded values.
    if (raw?.constructor !== String)
      throw new Error("Review answers must contain text values.");
    const trimmed = raw.trim();
    if (trimmed.length > 4_000)
      throw new Error("Each review answer must be 4,000 characters or fewer.");
    if (trimmed) {
      // SAFETY: key is iterated from allowed keys of ReviewAnswers.
      clean[key as keyof ReviewAnswers] = trimmed;
    }
  }
  return clean;
}

/** Answer keys across all cadences (kept-when-present, per validateAnswers). */
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

function normalizeAnswers(
  value: Prisma.JsonValue | null | undefined,
): ReviewAnswers {
  if (!(value instanceof Object) || Array.isArray(value)) return {};
  const answers: ReviewAnswers = {};
  for (const key of ANSWER_KEYS) {
    const raw = value[key];
    // Constructor identity: exact primitive-string test for JSON values.
    if (raw?.constructor === String) answers[key] = raw;
  }
  return answers;
}

function parseSnapshot(
  value: Prisma.JsonValue | null | undefined,
): ReviewSnapshot | null {
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
