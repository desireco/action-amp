/**
 * S1 — the focused-task read (webapp `getFocusedTask`), ported as a
 * domain-side query. The include shape (tags + FULL chronological updates +
 * FULL sessions + attachments + project→goal + direct goal) is deliberately
 * not one of the seam's inventoried overloads — `hydrateTopTaskData` covers
 * the winner's NOTE-only hydration, and Focus needs the whole thread — so
 * this module speaks the same Drizzle relational API `db/client.ts` uses
 * directly (never `db.$client` raw — inventory §7). Returned rows keep JS
 * `Date`s (mode:'date' columns), exactly like the seam delegates.
 */
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { DomainDb } from "../db/client.js";
import { goal, project, tag, tagToTask, task, taskAttachment, taskSession, taskUpdate } from "../db/schema/index.js";
import type { Task } from "../db/types.js";

/** The focused-task payload: base row + the relations Focus renders. */
export interface FocusedTaskRow extends Task {
  tags: Array<{ id: string; name: string }>;
  updates: Array<{ id: string; body: string; kind: string; createdAt: Date }>;
  sessions: Array<{
    id: string;
    startedAt: Date;
    endedAt: Date | null;
    plannedMinutes: number | null;
    completed: boolean;
  }>;
  attachments: Array<{ id: string; filename: string; mimeType: string }>;
  project: {
    id: string;
    permalink: string;
    name: string;
    goal: { id: string; name: string; description: string | null } | null;
  } | null;
  goal: {
    id: string;
    permalink: string;
    name: string;
    description: string | null;
  } | null;
}

/** The user's one started task (Now), or null. Ordered by startedAt desc —
 *  the single-Now invariant makes it one row; the order is defensive. */
export async function getFocusedTaskData(
  db: DomainDb,
  { userId }: { userId: string },
): Promise<FocusedTaskRow | null> {
  const rows = await db
    .select()
    .from(task)
    .where(and(eq(task.userId, userId), eq(task.isDone, false), isNotNull(task.startedAt)))
    .orderBy(desc(task.startedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [tagRows, updateRows, sessionRows, attachmentRows, projectRows] = await Promise.all([
    db
      .select({ id: tag.id, name: tag.name })
      .from(tagToTask)
      .innerJoin(tag, eq(tag.id, tagToTask.a))
      .where(eq(tagToTask.b, row.id)),
    db
      .select()
      .from(taskUpdate)
      .where(eq(taskUpdate.taskId, row.id))
      .orderBy(asc(taskUpdate.createdAt)),
    db
      .select()
      .from(taskSession)
      .where(eq(taskSession.taskId, row.id))
      .orderBy(asc(taskSession.startedAt)),
    db
      .select({
        id: taskAttachment.id,
        filename: taskAttachment.filename,
        mimeType: taskAttachment.mimeType,
      })
      .from(taskAttachment)
      .where(eq(taskAttachment.taskId, row.id)),
    row.projectId
      ? db
          .select({
            id: project.id,
            permalink: project.permalink,
            name: project.name,
            goalId: project.goalId,
          })
          .from(project)
          .where(eq(project.id, row.projectId))
          .limit(1)
      : Promise.resolve([] as Array<{ id: string; permalink: string; name: string; goalId: string | null }>),
  ]);

  // The project's nested goal (id/name/description) — Project-Goal precedence
  // input for the shared resolver in the client's task-context helpers.
  const projectRow = projectRows[0] ?? null;
  const projectGoalRef = projectRow?.goalId
    ? (
        await db
          .select({ id: goal.id, name: goal.name, description: goal.description })
          .from(goal)
          .where(eq(goal.id, projectRow.goalId))
          .limit(1)
      )[0] ?? null
    : null;

  // The task's direct (legacy) goal with description.
  const goalRef = row.goalId
    ? (
        await db
          .select({
            id: goal.id,
            permalink: goal.permalink,
            name: goal.name,
            description: goal.description,
          })
          .from(goal)
          .where(eq(goal.id, row.goalId))
          .limit(1)
      )[0] ?? null
    : null;

  return {
    ...row,
    tags: tagRows,
    updates: updateRows.map((update) => ({
      id: update.id,
      body: update.body,
      kind: update.kind,
      createdAt: update.createdAt,
    })),
    sessions: sessionRows.map((session) => ({
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      plannedMinutes: session.plannedMinutes,
      completed: session.completed,
    })),
    attachments: attachmentRows,
    project: projectRow
      ? {
          id: projectRow.id,
          permalink: projectRow.permalink,
          name: projectRow.name,
          goal: projectGoalRef,
        }
      : null,
    goal: goalRef,
  };
}
