/**
 * The rituals procedures — thin wrappers over the domain core (the goals.ts
 * layering + error translation, which see).
 *
 * Entitlement placement (docs/specs/rituals.md §Entitlements): EVERY op —
 * reads included — runs the whole-feature Pro gate FIRST
 * (`assertRitualsAllowed`, 402 `{feature, reason}`); FREE never touches
 * rituals, and a downgrade preserves data losslessly while gating ops.
 * No lens cap, no count cap — the gate is binary.
 *
 * The day is derived SERVER-side from the user's persisted IANA timeZone
 * (`currentPlainDate` → `plainDateToDb`, the @db.Date convention) — the
 * complete/uncheck/updateReflection inputs carry no date, so a client can
 * never write a foreign calendar day.
 */
import { implement, ORPCError } from "@orpc/server";
import { ritualsContract } from "@actionamp/contract";
import {
  archiveRitualCore,
  assertRitualsAllowed,
  completeRitualCore,
  createRitualEntities,
  createRitualCore,
  getRitualHistoryCore,
  getRitualsData,
  getTodayRitualsData,
  reorderRitualsCore,
  setRitualPausedCore,
  uncheckRitualCore,
  updateReflectionCore,
  updateRitualCore,
  type RitualListRow,
  type TodayRitualRow,
} from "@actionamp/domain/rituals";
import { currentPlainDate, plainDateToDb } from "@actionamp/domain/shared/time";
import { HttpError } from "@actionamp/domain/projects";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(ritualsContract).$context<ApiContext>();

// ----------------------------------------------------------------
// Error mapping (kept byte-identical to goals.ts — the fragments stay
// independently composable)
// ----------------------------------------------------------------

function toOrpcError(err: unknown): never {
  if (err instanceof HttpError) {
    const code =
      err.statusCode === 402
        ? "PAYMENT_REQUIRED"
        : err.statusCode === 404
          ? "NOT_FOUND"
          : err.statusCode === 409
            ? "CONFLICT"
            : "BAD_REQUEST";
    throw new ORPCError(code, {
      // PAYMENT_REQUIRED is not an oRPC built-in: without an explicit status
      // it answers 500 on the wire even when declared in the contract.
      ...(err.statusCode === 402 ? { status: 402 as const } : {}),
      message: err.message,
      data: err.data as Record<string, string> | undefined,
    });
  }
  throw err;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    toOrpcError(err);
  }
}

// ----------------------------------------------------------------
// Per-request helpers
// ----------------------------------------------------------------

/** The rituals delegates over the request's DB handle. */
function entities(context: ApiContext) {
  return createRitualEntities(context.db);
}

/** The user's persisted IANA zone (UTC fallback) — the day-model owner. */
async function timeZoneOf(context: ApiContext, userId: string): Promise<string> {
  const row = await context.entities.User.findUnique({ where: { id: userId } });
  return row?.timeZone ?? "UTC";
}

/** The lens fallback — the first included lens (Me), the creation default. */
async function primaryLensId(context: ApiContext, userId: string): Promise<string | null> {
  const lenses = await context.entities.Lens.findMany({
    where: { userId, isIncluded: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return lenses[0]?.id ?? null;
}

// ----------------------------------------------------------------
// Row → DTO mappers
// ----------------------------------------------------------------

function toRitualDto(row: RitualListRow) {
  return {
    id: row.id,
    name: row.name,
    lensId: row.lensId,
    interval: row.interval,
    cadence: row.cadence,
    weekday: row.weekday,
    intervalDays: row.intervalDays,
    guidance: row.guidance,
    benefit: row.benefit,
    goalId: row.goalId,
    order: row.order,
    paused: row.pausedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    entryToday: row.entryToday,
  };
}

function toTodayRitualDto(row: TodayRitualRow) {
  return {
    id: row.id,
    name: row.name,
    lensId: row.lensId,
    interval: row.interval,
    cadence: row.cadence,
    weekday: row.weekday,
    intervalDays: row.intervalDays,
    guidance: row.guidance,
    benefit: row.benefit,
    goalId: row.goalId,
    order: row.order,
    paused: row.pausedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lensName: row.lensName,
    checked: row.checked,
    mood: row.mood,
    note: row.note,
  };
}

// ----------------------------------------------------------------
// Procedures
// ----------------------------------------------------------------

const list = ORPC.list.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const lensId = input.lensId ?? (await primaryLensId(context, user.id));
    if (!lensId) return [];
    const timeZone = await timeZoneOf(context, user.id);
    const rows = await getRitualsData(entities(context), {
      userId: user.id,
      lensId,
      today: currentPlainDate(timeZone),
    });
    return rows.map(toRitualDto);
  }),
);

const today = ORPC.today.handler(async ({ context }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const timeZone = await timeZoneOf(context, user.id);
    const rows = await getTodayRitualsData(entities(context), {
      userId: user.id,
      today: currentPlainDate(timeZone),
      timeZone,
    });
    return rows.map(toTodayRitualDto);
  }),
);

const history = ORPC.history.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const rows = await getRitualHistoryCore(entities(context), {
      userId: user.id,
      ritualId: input.id,
    });
    return rows.map((e) => ({
      localDate: e.localDate.toISOString().slice(0, 10),
      mood: e.mood,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    }));
  }),
);

const reorder = ORPC.reorder.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const lensId = input.lensId ?? (await primaryLensId(context, user.id));
    if (!lensId) {
      throw new ORPCError("BAD_REQUEST", { message: "No Lens found for this account." });
    }
    return await reorderRitualsCore(entities(context), {
      userId: user.id,
      lensId,
      orderedIds: input.orderedIds,
    });
  }),
);

const create = ORPC.create.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    // Creation defaults the lens to Me (the first included lens) — rituals
    // are mostly personal; changeable in the form.
    const lensId = input.lensId ?? (await primaryLensId(context, user.id));
    if (!lensId) {
      throw new ORPCError("BAD_REQUEST", { message: "No Lens found for this account." });
    }
    const row = await createRitualCore(entities(context), {
      userId: user.id,
      lensId,
      name: input.name,
      interval: input.interval,
      cadence: input.cadence,
      weekday: input.weekday ?? null,
      intervalDays: input.intervalDays ?? null,
      guidance: input.guidance ?? null,
      benefit: input.benefit ?? null,
      goalId: input.goalId ?? null,
    });
    return { id: row.id, name: row.name };
  }),
);

const update = ORPC.update.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const row = await updateRitualCore(entities(context), {
      userId: user.id,
      id: input.id,
      name: input.name,
      interval: input.interval,
      cadence: input.cadence,
      weekday: input.weekday,
      intervalDays: input.intervalDays,
      guidance: input.guidance,
      benefit: input.benefit,
      goalId: input.goalId,
    });
    return { id: row.id };
  }),
);

/** The local day derived at check time — the locked date-model primitive. */
async function todayDate(context: ApiContext, userId: string) {
  const timeZone = await timeZoneOf(context, userId);
  return plainDateToDb(currentPlainDate(timeZone));
}

const complete = ORPC.complete.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const localDate = await todayDate(context, user.id);
    const row = await completeRitualCore(entities(context), {
      userId: user.id,
      ritualId: input.id,
      localDate,
      mood: input.mood ?? null,
      note: input.note ?? null,
    });
    return { id: row.ritualId };
  }),
);

const uncheck = ORPC.uncheck.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const localDate = await todayDate(context, user.id);
    await uncheckRitualCore(entities(context), {
      userId: user.id,
      ritualId: input.id,
      localDate,
    });
    return { id: input.id };
  }),
);

const updateReflection = ORPC.updateReflection.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const localDate = await todayDate(context, user.id);
    const row = await updateReflectionCore(entities(context), {
      userId: user.id,
      ritualId: input.id,
      localDate,
      mood: input.mood,
      note: input.note,
    });
    return { id: row.ritualId };
  }),
);

const setPaused = ORPC.setPaused.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const row = await setRitualPausedCore(entities(context), {
      userId: user.id,
      id: input.id,
      paused: input.paused,
    });
    return { id: row.id };
  }),
);

const archive = ORPC.archive.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertRitualsAllowed(user);
    const row = await archiveRitualCore(entities(context), {
      userId: user.id,
      id: input.id,
    });
    return { id: row.id };
  }),
);

/** The implemented rituals fragment — composed by src/router.ts (one line). */
export const ritualsProcedures = {
  list,
  today,
  history,
  create,
  update,
  complete,
  uncheck,
  updateReflection,
  setPaused,
  archive,
  reorder,
};
