// S1+S4 — the Drizzle-backed delegates the task-lifecycle cores need
// (`createTaskExtrasEntities`): the TaskUpdate activity thread, the User
// prefs row (focus minutes / Today cap / time zone / rollover stamp), and
// the Project/Goal parent lookups the one-parent rule enforces.
//
// Same story as ../simpleLists/entities.ts: the seam's `createEntities`
// (../db/client.ts) carries the F4b-inventoried delegates only, so this
// batch ships its extra delegates beside the cores that need them, over the
// SAME `DomainDb` handle and following the same client-side-default rules
// (mint ids on create; TaskUpdate/User carry no `updatedAt` — nothing to
// re-stamp). Tests fake these slices with vi.fn() spies and never see the
// defaults.
import { and, asc, eq } from "drizzle-orm";
import { goal, project, taskUpdate, user } from "../db/schema/index.js";
import { mintId } from "../db/client.js";
import type { DomainDb } from "../db/client.js";
import type { Goal, Project, TaskUpdate } from "../db/types.js";

function assertFound(row: unknown | undefined, model: string): void {
  if (row === undefined || row === null) {
    throw new Error(`${model} not found.`);
  }
}

/** The User row fields the S1/S4 procedures read (focus + app-shell prefs). */
export interface UserPrefsRow {
  focusSessionMinutes: number;
  todayCap: number;
  timeZone: string | null;
  lastTodayRolloverAt: Date | null;
  lastActiveAt: Date | null;
  onboardingStage: string;
}

/** The `User.onboardingStage` enum values (webapp/schema.prisma). */
type OnboardingStage = "SAMPLE_TASK" | "CAPTURE" | "TRIAGE" | "COMPLETE";

export interface TaskExtrasEntities {
  TaskUpdate: {
    create(args: {
      data: { body: string; kind: "NOTE" | "COMPLETED"; taskId: string; userId: string };
    }): Promise<TaskUpdate>;
  };
  User: {
    findUnique(args: { where: { id: string } }): Promise<UserPrefsRow | null>;
    updateMany(args: {
      where: { id: string; onboardingStage?: OnboardingStage };
      data: {
        onboardingStage?: OnboardingStage;
        lastTodayRolloverAt?: Date;
        lastActiveAt?: Date;
      };
    }): Promise<{ count: number }>;
  };
  Project: {
    /** The one-parent rule's guard-read (ownership + lens + type). */
    findUnique(args: {
      where: { id: string };
    }): Promise<Pick<Project, "userId" | "lensId" | "type"> | null>;
    /** The simple-list page host's lookup by permalink (tenancy-scoped). */
    findFirst(args: { where: { userId: string; permalink: string } }): Promise<Project | null>;
    /** The row-editor's project picker: lens projects + their goal's name. */
    findMany(args: {
      where: { userId: string; lensId: string; isDone: boolean };
    }): Promise<Array<Project & { goalName: string | null }>>;
  };
  Goal: {
    findUnique(args: {
      where: { id: string };
    }): Promise<Pick<Goal, "userId" | "lensId"> | null>;
    findMany(args: {
      where: { userId: string; lensId: string; isDone: boolean };
    }): Promise<Goal[]>;
  };
}

export function createTaskExtrasEntities(db: DomainDb): TaskExtrasEntities {
  return {
    TaskUpdate: {
      create: async (args) => {
        const rows = await db
          .insert(taskUpdate)
          .values({
            id: mintId(),
            body: args.data.body,
            kind: args.data.kind,
            taskId: args.data.taskId,
            userId: args.data.userId,
          })
          .returning();
        const row = rows[0];
        assertFound(row, "TaskUpdate");
        return row;
      },
    },
    User: {
      findUnique: async (args) => {
        const rows = await db
          .select({
            focusSessionMinutes: user.focusSessionMinutes,
            todayCap: user.todayCap,
            timeZone: user.timeZone,
            lastTodayRolloverAt: user.lastTodayRolloverAt,
            lastActiveAt: user.lastActiveAt,
            onboardingStage: user.onboardingStage,
          })
          .from(user)
          .where(eq(user.id, args.where.id))
          .limit(1);
        return rows[0] ?? null;
      },
      updateMany: async (args) => {
        const patch: Record<string, unknown> = {};
        if (args.data.onboardingStage !== undefined) {
          patch.onboardingStage = args.data.onboardingStage;
        }
        if (args.data.lastTodayRolloverAt !== undefined) {
          patch.lastTodayRolloverAt = args.data.lastTodayRolloverAt;
        }
        if (args.data.lastActiveAt !== undefined) patch.lastActiveAt = args.data.lastActiveAt;
        if (Object.keys(patch).length === 0) return { count: 0 };
        let whereClause = eq(user.id, args.where.id);
        if (args.where.onboardingStage !== undefined) {
          whereClause = and(whereClause, eq(user.onboardingStage, args.where.onboardingStage))!;
        }
        const rows = await db
          .update(user)
          .set(patch)
          .where(whereClause)
          .returning({ id: user.id });
        return { count: rows.length };
      },
    },
    Project: {
      findUnique: async (args) => {
        const rows = await db
          .select({ userId: project.userId, lensId: project.lensId, type: project.type })
          .from(project)
          .where(eq(project.id, args.where.id))
          .limit(1);
        return rows[0] ?? null;
      },
      findFirst: async (args) => {
        const rows = await db
          .select()
          .from(project)
          .where(
            and(eq(project.userId, args.where.userId), eq(project.permalink, args.where.permalink)),
          )
          .limit(1);
        return rows[0] ?? null;
      },
      findMany: async (args) => {
        const rows = await db
          .select({ projectRow: project, goalName: goal.name })
          .from(project)
          .leftJoin(goal, eq(goal.id, project.goalId))
          .where(
            and(
              eq(project.userId, args.where.userId),
              eq(project.lensId, args.where.lensId),
              eq(project.isDone, args.where.isDone),
            ),
          )
          .orderBy(asc(project.order), asc(project.createdAt));
        return rows.map((row) => ({ ...row.projectRow, goalName: row.goalName ?? null }));
      },
    },
    Goal: {
      findUnique: async (args) => {
        const rows = await db
          .select({ userId: goal.userId, lensId: goal.lensId })
          .from(goal)
          .where(eq(goal.id, args.where.id))
          .limit(1);
        return rows[0] ?? null;
      },
      findMany: async (args) => {
        return await db
          .select()
          .from(goal)
          .where(
            and(
              eq(goal.userId, args.where.userId),
              eq(goal.lensId, args.where.lensId),
              eq(goal.isDone, args.where.isDone),
            ),
          )
          .orderBy(asc(goal.createdAt));
      },
    },
  };
}
