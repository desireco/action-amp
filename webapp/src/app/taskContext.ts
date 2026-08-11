/**
 * Pure Goal-rationale + work-continuity normalization.
 *
 * Shared by Next (`NextPage`), Focus (`focusTaskView`), and the CLI
 * (`/api/cli/now`). This module owns Goal precedence, description trimming,
 * valid-session arithmetic, minute formatting, NOTE filtering, count-grammar
 * inputs, latest-note selection, and the CLI's why/whyItMatters strings. It is
 * PURE: same input → same output, no I/O, no React/Wasp/browser imports.
 * React components and the CLI route receive these normalized values and do
 * NOT reinterpret raw Prisma relations or timestamps.
 *
 * Contract: docs/specs/focus-goal-context.md.
 */

import { composeWhy, type FocusWhyInput } from "./focusWhy";

// ----------------------------------------------------------------
// Input shapes — the owned, hydrated Task row (subset the resolvers read).
// Structural types so the helper depends on data shape, not the ORM.
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
 * `hydrateTopTaskData` and `getFocusedTask` return: Project with an optional
 * nested Goal, an optional legacy direct Goal, sessions, and NOTE updates.
 */
export interface TaskContextInput {
  project?: { id: string; name: string; permalink?: string; goal?: GoalRef | null } | null;
  goal?: GoalRef | null;
  sessions?: { startedAt: Date | string; endedAt?: Date | string | null }[];
  // NOTE-only updates, newest-first (hydrateTopTaskData filters kind === NOTE;
  // getFocusedTask passes its full thread — resolveContinuity re-filters).
  updates?: { body: string; createdAt: Date | string; kind?: string }[];
}

// ----------------------------------------------------------------
// Output shapes — what Next/Focus/CLI render.
// ----------------------------------------------------------------

export interface GoalContext {
  name: string;
  description: string | null;
}

export interface TaskContinuity {
  /** Total worked milliseconds across valid closed sessions. */
  workedMs: number;
  /** Human label like "42 min worked", or null when no valid time. */
  workedLabel: string | null;
  /** Count of valid closed sessions. */
  sessionCount: number;
  /** Count of trimmed non-empty NOTE updates. */
  noteCount: number;
  /** Newest valid NOTE body (trimmed), or null. */
  latestNote: string | null;
}

// ----------------------------------------------------------------
// Goal resolution — Project Goal wins over legacy direct Goal.
// ----------------------------------------------------------------

/**
 * Resolve one Goal for presentation, or null when the Task has no Goal.
 *
 * Precedence (spec §"Goal resolution"):
 *   1. `task.project.goal` when the Task's Project has a Goal;
 *   2. otherwise `task.goal` for legacy direct-Goal Tasks;
 *   3. otherwise `null`.
 *
 * Project-linked Goal is authoritative. If legacy data carries both links and
 * they disagree, the Project Goal wins — one Goal is shown, never merged.
 */
export function resolveGoal(task: TaskContextInput): GoalContext | null {
  const ref: GoalRef | null = task.project?.goal ?? task.goal ?? null;
  if (!ref) return null;
  // Trim description; whitespace-only becomes null so fallback copy applies.
  const trimmed = ref.description?.trim() || null;
  return { name: ref.name, description: trimmed };
}

/**
 * The Goal rationale copy for a surface (Next/Focus), or null when no Goal.
 *
 * With a non-empty description: the question, the trimmed description, and the
 * attribution. With no usable description: `Toward <Goal name>.` only (no
 * duplicate attribution line). The caller renders the question line itself;
 * this returns the answer + attribution so surfaces can style them separately.
 */
export function goalRationale(task: TaskContextInput): {
  question: string;
  answer: string;
  attribution: string | null;
} | null {
  const goal = resolveGoal(task);
  if (!goal) return null;
  if (goal.description) {
    return {
      question: "Why does this matter?",
      answer: goal.description,
      attribution: `Goal · ${goal.name}`,
    };
  }
  return {
    question: "Why does this matter?",
    answer: `Toward ${goal.name}.`,
    attribution: null,
  };
}

// ----------------------------------------------------------------
// Continuity — valid closed sessions + NOTE updates only.
// ----------------------------------------------------------------

/**
 * A valid session has `endedAt > startedAt`. Open (endedAt null), zero-length,
 * reversed, or invalid dates do not count — they never inflate totals.
 */
function isValidSession(s: {
  startedAt: Date | string;
  endedAt?: Date | string | null;
}): boolean {
  if (!s.endedAt) return false;
  const start = new Date(s.startedAt).getTime();
  const end = new Date(s.endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return end > start;
}

function sessionDurationMs(s: {
  startedAt: Date | string;
  endedAt?: Date | string | null;
}): number {
  const start = new Date(s.startedAt).getTime();
  const end = new Date(s.endedAt!).getTime();
  return Math.max(0, end - start);
}

/**
 * Format an aggregate worked duration in milliseconds as a `<n> min worked`
 * label, or null when there is no positive time.
 *
 * - Positive sub-minute work → `<1 min worked`.
 * - Otherwise round to the nearest whole minute with correct singular/plural.
 * - Zero → null (no segment shown).
 */
export function formatWorkedLabel(workedMs: number): string | null {
  if (!Number.isFinite(workedMs) || workedMs <= 0) return null;
  // Spec: positive time below 60 seconds renders "<1 min worked". The
  // threshold is on raw ms, NOT the rounded value — 59,999ms is sub-minute.
  if (workedMs < 60_000) return "<1 min worked";
  // Otherwise round to the nearest whole minute with correct singular/plural.
  const minutes = Math.round(workedMs / 60_000);
  if (minutes < 1) return "<1 min worked"; // defensive (shouldn't reach)
  if (minutes === 1) return "1 min worked";
  return `${minutes} min worked`;
}

/**
 * Build the continuity summary from the owned Task's sessions + updates.
 *
 * Worked time is the sum of valid closed-session durations. Session/note counts
 * use valid sessions and trimmed non-empty NOTE updates respectively. The
 * newest valid NOTE (by createdAt) is selected independent of input ordering.
 * Zero/negative values produce null segments — the caller never shows an empty
 * row.
 */
export function resolveContinuity(task: TaskContextInput): TaskContinuity {
  const sessions = task.sessions ?? [];
  const valid = sessions.filter(isValidSession);
  const workedMs = valid.reduce((sum, s) => sum + sessionDurationMs(s), 0);

  // NOTE-only, trimmed non-empty bodies. getFocusedTask passes its full thread
  // (NOTE + COMPLETED); hydrateTopTaskData pre-filters. Re-filtering here keeps
  // both callers correct.
  const notes = (task.updates ?? [])
    .filter((u) => (u.kind ?? "NOTE") === "NOTE")
    .map((u) => ({ body: u.body.trim(), at: new Date(u.createdAt).getTime() }))
    .filter((u) => u.body.length > 0 && !Number.isNaN(u.at));

  // Newest first by createdAt; pick the first body after sorting.
  const newest = [...notes].sort((a, b) => b.at - a.at)[0]?.body ?? null;

  return {
    workedMs,
    workedLabel: formatWorkedLabel(workedMs),
    sessionCount: valid.length,
    noteCount: notes.length,
    latestNote: newest,
  };
}

/**
 * The continuity stats row as the Next card renders it, e.g.
 * "42 min worked · 2 sessions · 3 notes". Returns null when every segment is
 * zero/absent — the card shows no row at all in that case.
 *
 * Segment order: worked time, sessions, notes. Zero segments are omitted;
 * singular/plural is correct for sessions and notes.
 */
export function continuityStatsRow(c: TaskContinuity): string | null {
  const parts: string[] = [];
  if (c.workedLabel) parts.push(c.workedLabel);
  if (c.sessionCount > 0) {
    parts.push(`${c.sessionCount} session${c.sessionCount === 1 ? "" : "s"}`);
  }
  if (c.noteCount > 0) {
    parts.push(`${c.noteCount} note${c.noteCount === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

// ----------------------------------------------------------------
// CLI `now` context — Project, Goal, whyNow, whyItMatters.
// ----------------------------------------------------------------

export interface NowContext {
  project: { id: string; name: string; permalink?: string } | null;
  goal: {
    id: string;
    name: string;
    permalink?: string;
    description: string | null;
  } | null;
  /** Joined truthful matcher explanation, or null when no clause applies. */
  whyNow: string | null;
  /** Goal-backed rationale, or null when no Goal. */
  whyItMatters: string | null;
}

/**
 * Build the additive `context` object for CLI `now`.
 *
 * - `project` reflects the Task's Project (if any).
 * - `goal` is the resolved Goal (Project Goal precedence; legacy direct as
 *   fallback), with the trimmed description. Null when neither exists.
 * - `whyNow` joins `composeWhy`'s truthful clauses; null when the matcher has
 *   nothing truthful to say.
 * - `whyItMatters` is the trimmed Goal description, or `Toward <name>.`
 *   fallback, or null when no Goal.
 *
 * Never manufactures rationale from Project/Task text, priority, due date, or
 * matcher/work history. Returns null fields rather than placeholder copy.
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
