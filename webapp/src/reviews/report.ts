import { buildReviewSlices } from "./period";
import type {
  ReviewAnswers,
  ReviewGoalItem,
  ReviewLensRef,
  ReviewProjectItem,
  ReviewResult,
  ReviewTaskItem,
} from "./types";

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
