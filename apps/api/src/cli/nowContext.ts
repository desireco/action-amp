/**
 * CLI `now` context — pure port of `webapp/src/app/focusWhy.ts` (composeWhy)
 * and `webapp/src/app/taskContext.ts` (buildNowContext + its Goal/continuity
 * resolvers). Bodies are verbatim; the only edits are import specifiers
 * (Temporal via @actionamp/domain/shared/time) and dropping the webapp-only
 * exports this route never reads. Contract: docs/specs/focus-goal-context.md.
 */
import {
  calendarDayDifference,
  currentPlainDate,
  plainDateFromValue,
} from "@actionamp/domain/shared/time";

// ----------------------------------------------------------------
// focusWhy — the truthful "why this?" composer
// ----------------------------------------------------------------

export interface FocusWhyInput {
  startedAt?: Date | string | null;
  priority: "LOW" | "NORMAL" | "IMPORTANT" | string;
  size: "S" | "M" | "L" | "XL" | string;
  status?: "TODAY" | "UPCOMING" | "SOMEDAY" | string;
  scheduledDate?: Date | string | null;
}

export interface FocusWhy {
  lead: string;
  detail: string;
}

const SIZE_MINUTES = new Map<string, number>([
  ["S", 15],
  ["M", 30],
  ["L", 60],
  ["XL", 120],
]);

/** Whole-day diff: 0 = today, -1 = overdue, 1 = tomorrow, etc. */
function dayDiff(date: Date | string): number {
  return calendarDayDifference(currentPlainDate(), plainDateFromValue(date));
}

/** The truthful due clause, or null when there's no due date to speak of. */
function dueClause(scheduledDate: FocusWhyInput["scheduledDate"]): string | null {
  if (!scheduledDate) return null; // no horizon → never fabricate a due reason
  const diff = dayDiff(scheduledDate);
  if (diff < 0) return "overdue";
  if (diff === 0) return "due today";
  if (diff === 1) return "due tomorrow";
  // SAFETY: the runtime PlainDate carries toLocaleString; the domain seam's
  // minimal structural interface doesn't declare it.
  const date = plainDateFromValue(scheduledDate) as unknown as {
    toLocaleString(
      locale: string,
      opts: Record<string, string>,
    ): string;
  };
  if (diff <= 7) {
    return `due ${date.toLocaleString("en-US", { weekday: "short" })}`;
  }
  return `due ${date.toLocaleString("en-US", { month: "short", day: "numeric" })}`;
}

/** "fits in 15 min" only for the small sizes where it's a useful nudge. */
function sizeClause(size: FocusWhyInput["size"]): string | null {
  const mins = SIZE_MINUTES.get(size);
  if (!mins || mins >= 60) return null;
  return `fits in ${mins} min`;
}

export function composeWhy(task: FocusWhyInput): FocusWhy {
  // 1. In-progress is the terminal signal — nothing else to say.
  if (task.startedAt) {
    return { lead: "You're already doing this.", detail: "" };
  }

  // 2/3. Priority lead.
  let lead = "";
  if (task.priority === "IMPORTANT") {
    lead = "Important";
  } else if (task.priority === "LOW") {
    const minutes = SIZE_MINUTES.get(task.size);
    lead = minutes && minutes < 60 ? "Quick win" : "Low priority";
  }

  // 4/5. Append truthful detail clauses (due, then size-fit).
  const due = dueClause(task.scheduledDate);
  const size = sizeClause(task.size);
  const parts = [due, size].filter(
    (p): p is string => p !== null && p !== undefined,
  );

  let detail = "";
  if (parts.length > 0) {
    if (lead) {
      detail = parts.length === 1 && due === "overdue" ? `and ${parts[0]}` : `— ${parts.join(", ")}`;
    } else {
      // No lead (NORMAL priority): the detail IS the reason. Capitalize the first letter.
      detail = parts.join(", ");
      detail = detail.charAt(0).toUpperCase() + detail.slice(1);
    }
  }

  return { lead, detail };
}

// ----------------------------------------------------------------
// taskContext — Goal resolution + the CLI NowContext builder
// ----------------------------------------------------------------

/** A Goal as selected by hydrateTopTaskData / getFocusedTask. */
export interface GoalRef {
  id: string;
  name: string;
  permalink?: string;
  description?: string | null;
}

/**
 * The hydrated Task shape these resolvers read. Mirrors what
 * `hydrateTopTaskData` returns: Project with an optional nested Goal, an
 * optional legacy direct Goal, sessions, and NOTE updates.
 */
export interface TaskContextInput {
  project?: { id: string; name: string; permalink?: string; goal?: GoalRef | null } | null;
  goal?: GoalRef | null;
  sessions?: { startedAt: Date | string; endedAt?: Date | string | null }[];
  updates?: { body: string; createdAt: Date | string; kind?: string }[];
}

export interface NowContext {
  project: { id: string; name: string; permalink?: string } | null;
  goal: {
    id: string;
    name: string;
    permalink?: string;
    description: string | null;
  } | null;
  whyNow: string | null;
  whyItMatters: string | null;
}

/**
 * Resolve one Goal for presentation, or null when the Task has no Goal.
 * Project-linked Goal is authoritative over the legacy direct Goal.
 */
function resolveGoal(task: TaskContextInput): {
  name: string;
  description: string | null;
} | null {
  const ref: GoalRef | null = task.project?.goal ?? task.goal ?? null;
  if (!ref) return null;
  // Trim description; whitespace-only becomes null so fallback copy applies.
  const trimmed = ref.description?.trim() || null;
  return { name: ref.name, description: trimmed };
}

/**
 * Build the additive `context` object for CLI `now`. Never manufactures
 * rationale from Project/Task text, priority, due date, or matcher/work
 * history — returns null fields rather than placeholder copy. (Pure — same
 * input → same output; the hydration happens via @actionamp/domain/tasks.)
 */
export function buildNowContext(
  task: TaskContextInput & FocusWhyInput,
  projectRef?: { id: string; name: string; permalink?: string } | null,
): NowContext {
  // whyNow — join the matcher's truthful lead + detail.
  const why = composeWhy(task);
  const whyParts = [why.lead, why.detail].filter((p) => p && p.trim().length > 0);
  const whyNow = whyParts.length > 0 ? whyParts.join(" ") : null;

  // Goal resolution + whyItMatters.
  const goal = resolveGoal(task);
  let whyItMatters: string | null = null;
  let goalOut: NowContext["goal"] = null;
  if (goal) {
    whyItMatters = goal.description ?? `Toward ${goal.name}.`;
    // Carry the resolved Goal's id/name/permalink. Project Goal precedence is
    // already applied in resolveGoal; surface that same Goal here.
    const ref = task.project?.goal ?? task.goal;
    if (ref) {
      goalOut = {
        id: ref.id,
        name: ref.name,
        permalink: ref.permalink,
        description: goal.description,
      };
    }
  }

  return {
    project: projectRef
      ? {
          id: projectRef.id,
          name: projectRef.name,
          permalink: projectRef.permalink,
        }
      : null,
    goal: goalOut,
    whyNow,
    whyItMatters,
  };
}
