/** Pure, tenant-scoped data operations for Rituals (the habits layer).
 *
 *  New-stack feature (docs/specs/rituals.md, locked 2026-09-15) — built on
 *  the simpleLists pattern: every core takes a fakeable entities slice as
 *  its first arg, no server framework import. The Drizzle delegates live in
 *  `./entities.ts` (`createRitualEntities`); the API layer composes them
 *  over the request's DB handle.
 *
 *  Due-ness is DERIVED, never stored: `isDueOn` is a pure function of
 *  cadence + fields ("today's rituals" = the unpaused, unarchived set
 *  filtered by it, joined against entries for checked state). No
 *  next-occurrence column, no materialization job — the same lazy stance
 *  as the Today rollover and review cadences.
 *
 *  `localDate` follows the locked date-model primitive: the user's calendar
 *  day in their persisted IANA timeZone at check time, carried as a
 *  UTC-midnight `Date` (the @db.Date convention every other date column
 *  uses). Unchecking deletes the entry, reflection included; re-checking
 *  asks again. */
import {
  calendarDayDifference,
  instantFrom,
  instantToPlainDate,
  plainDateToDb,
  type PlainDate,
} from "../shared/time/temporal.js";
import { isEntitled, type EntitlementMessage } from "../billing/entitlements.js";
import { HttpError } from "../projects/httpError.js";

// ----------------------------------------------------------------
// Row + wire types
// ----------------------------------------------------------------

/** The daily slot a Ritual belongs to — an assignment and a grouping on
 *  Today, not an alarm (no per-interval reminders, no time enforcement). */
export type RitualInterval = "MORNING" | "MIDDAY" | "EVENING";

/** The four cadence shapes — no RRULE, ever (§Non-goals). */
export type RitualCadence = "DAILY" | "WEEKDAYS" | "WEEKLY" | "INTERVAL";

/** Optional reflection facts — plain facts, never judgment. */
export type RitualMood = "HAPPY" | "NEUTRAL" | "NEGATIVE";

/** Prisma `Ritual` row equivalent (mirrors the `Ritual` table). */
export interface RitualRow {
  id: string;
  userId: string;
  lensId: string;
  name: string;
  interval: RitualInterval;
  cadence: RitualCadence;
  /** 0–6 ISO order (Mon = 0) — read when cadence = WEEKLY. */
  weekday: number | null;
  /** 2–365 — read when cadence = INTERVAL. */
  intervalDays: number | null;
  goalId: string | null;
  order: number;
  pausedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Prisma `RitualEntry` row equivalent — one row per checked day. */
export interface RitualEntryRow {
  id: string;
  ritualId: string;
  userId: string;
  /** UTC-midnight `Date` (the @db.Date convention). */
  localDate: Date;
  mood: RitualMood | null;
  note: string | null;
  createdAt: Date;
}

/** A Planning-page row: the ritual + today's entry state (null = unchecked). */
export interface RitualListRow extends RitualRow {
  entryToday: { mood: RitualMood | null; note: string | null } | null;
}

/** A Today-section row: the due ritual + its lens pill name + checked state. */
export interface TodayRitualRow extends RitualRow {
  lensName: string | null;
  checked: boolean;
  mood: RitualMood | null;
  note: string | null;
}

// ----------------------------------------------------------------
// Entities slices — the delegates these cores call (structural)
// ----------------------------------------------------------------

export interface RitualCreateData {
  userId: string;
  lensId: string;
  name: string;
  interval: RitualInterval;
  cadence: RitualCadence;
  weekday: number | null;
  intervalDays: number | null;
  goalId: string | null;
  order: number;
}

export interface RitualUpdateData {
  name?: string;
  interval?: RitualInterval;
  cadence?: RitualCadence;
  weekday?: number | null;
  intervalDays?: number | null;
  goalId?: string | null;
  pausedAt?: Date | null;
  archivedAt?: Date | null;
}

/** The delegates this core calls — fakeable with vi.fn() spies. */
export interface RitualEntities {
  Ritual: {
    /** Tenancy-safe ownership read. */
    findFirst(args: {
      where: { id: string; userId: string };
    }): Promise<RitualRow | null>;
    /** Active rituals for a user, `[order, createdAt]` — `includePaused`
     *  keeps paused rows (the Planning list); without it the delegate
     *  filters paused AND archived (the Today due set). */
    findMany(args: {
      where: { userId: string; lensId?: string; includePaused?: boolean };
    }): Promise<RitualRow[]>;
    /** The lens's highest `order` (create appends after it). */
    findMaxOrder(args: {
      where: { userId: string; lensId: string };
    }): Promise<number | null>;
    create(args: { data: RitualCreateData }): Promise<RitualRow>;
    update(args: {
      where: { id: string };
      data: RitualUpdateData;
    }): Promise<RitualRow>;
  };
  RitualEntry: {
    /** The (ritualId, localDate) unique read — one row per checked day. */
    findFirst(args: {
      where: { ritualId: string; localDate: Date };
    }): Promise<RitualEntryRow | null>;
    /** Today's entries for a ritual set (the checked-state join). */
    findMany(args: {
      where: { ritualIds: string[]; localDate: Date };
    }): Promise<RitualEntryRow[]>;
    create(args: {
      data: {
        ritualId: string;
        userId: string;
        localDate: Date;
        mood: RitualMood | null;
        note: string | null;
      };
    }): Promise<RitualEntryRow>;
    update(args: {
      where: { id: string };
      data: { mood?: RitualMood | null; note?: string | null };
    }): Promise<RitualEntryRow>;
    /** Uncheck — deletes the row, reflection included. Idempotent by design. */
    delete(args: { where: { ritualId: string; localDate: Date } }): Promise<void>;
  };
  Lens: {
    /** id + name pairs for the Today rows' lens pills. */
    findNames(args: { where: { userId: string } }): Promise<{ id: string; name: string }[]>;
  };
}

// ----------------------------------------------------------------
// Entitlement — the whole-feature Pro gate
// ----------------------------------------------------------------

/** Rituals are Pro-only; FREE never touches them (no free-tier count). */
export const RITUALS_MESSAGE: EntitlementMessage = {
  feature: "Rituals",
  reason: "keep daily rhythms, separate from tasks, with Pro",
};

/** The subset of a user the gate reads (the acting user satisfies it). */
export type RitualsUser = {
  plan?: string | null;
  planRenewsAt?: Date | null;
  isAdmin?: boolean | null;
  manualAccessGrant?: "PRO" | "FOUNDER" | "FRIEND" | null;
};

/**
 * Guard EVERY ritual op (read and write) against the whole-feature Pro gate.
 * `isEntitled` (not `isPlanActive`) is the check: manual grants, FOUNDER
 * lifetime, and the admin bypass all pass; a lapsed PRO is FREE. Throws the
 * webapp's exact 402 shape so the API maps it like every other gate.
 */
export function assertRitualsAllowed(user: RitualsUser | null): void {
  if (
    !isEntitled(
      user?.plan,
      user?.planRenewsAt ?? null,
      user?.isAdmin,
      user?.manualAccessGrant,
    )
  ) {
    throw new HttpError(402, `${RITUALS_MESSAGE.feature} is a Pro feature.`, {
      feature: RITUALS_MESSAGE.feature,
      reason: RITUALS_MESSAGE.reason,
    });
  }
}

// ----------------------------------------------------------------
// Due-ness — derived, never stored
// ----------------------------------------------------------------

export const MAX_RITUAL_NAME_LENGTH = 120;
export const MAX_RITUAL_NOTE_LENGTH = 500;

/**
 * Is this ritual's rhythm on this calendar date? A pure function of cadence
 * + fields — paused/archived filtering is the CALLER's where-clause, so this
 * answers cadence only.
 *
 * - DAILY: every day.
 * - WEEKDAYS: Monday–Friday.
 * - WEEKLY: `weekday` (0–6, Mon = 0) equals the date's ISO day − 1.
 * - INTERVAL: whole days since the creation local date (the phase anchor —
 *   stable, documented, not user-facing) divide evenly by `intervalDays`.
 *   `timeZone` is read only here: it anchors `createdAt` to a calendar day.
 */
export function isDueOn(
  ritual: Pick<RitualRow, "cadence" | "weekday" | "intervalDays" | "createdAt">,
  date: PlainDate,
  timeZone = "UTC",
): boolean {
  switch (ritual.cadence) {
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return date.dayOfWeek >= 1 && date.dayOfWeek <= 5;
    case "WEEKLY":
      return ritual.weekday === date.dayOfWeek - 1;
    case "INTERVAL": {
      const intervalDays = ritual.intervalDays;
      if (!intervalDays || intervalDays < 2) return false;
      const anchor = instantToPlainDate(instantFrom(ritual.createdAt), timeZone);
      const diff = calendarDayDifference(anchor, date);
      return diff >= 0 && diff % intervalDays === 0;
    }
  }
}

/** The interval groups' render order on Today: morning → midday → evening. */
export const INTERVAL_ORDER: readonly RitualInterval[] = ["MORNING", "MIDDAY", "EVENING"];

// ----------------------------------------------------------------
// Validation (the webapp cleanName set, applied to rituals)
// ----------------------------------------------------------------

function normalizedName(name: string): string {
  const value = name.trim();
  if (!value) throw new Error("Ritual name is required.");
  if (value.length > MAX_RITUAL_NAME_LENGTH) {
    throw new Error(`Ritual name must be ${MAX_RITUAL_NAME_LENGTH} characters or fewer.`);
  }
  return value;
}

function normalizedNote(note: string | null | undefined): string | null {
  const value = note?.trim() ?? "";
  if (!value) return null;
  if (value.length > MAX_RITUAL_NOTE_LENGTH) {
    throw new Error(`Note must be ${MAX_RITUAL_NOTE_LENGTH} characters or fewer.`);
  }
  return value;
}

function validatedCadenceFields(
  cadence: RitualCadence,
  weekday: number | null,
  intervalDays: number | null,
): { weekday: number | null; intervalDays: number | null } {
  if (cadence === "WEEKLY") {
    if (weekday === null || weekday === undefined || weekday < 0 || weekday > 6) {
      throw new Error("Weekly rituals need a day of the week.");
    }
    return { weekday, intervalDays: null };
  }
  if (cadence === "INTERVAL") {
    if (
      intervalDays === null ||
      intervalDays === undefined ||
      intervalDays < 2 ||
      intervalDays > 365
    ) {
      throw new Error("Interval rituals need a length of 2 to 365 days.");
    }
    return { weekday: null, intervalDays };
  }
  // DAILY / WEEKDAYS carry neither field.
  return { weekday: null, intervalDays: null };
}

async function requireOwnedRitual(
  entities: Pick<RitualEntities, "Ritual">,
  { userId, id }: { userId: string; id: string },
): Promise<RitualRow> {
  const ritual = await entities.Ritual.findFirst({ where: { id, userId } });
  if (!ritual) throw new Error("Ritual not found.");
  return ritual;
}

// ----------------------------------------------------------------
// Reads
// ----------------------------------------------------------------

/**
 * The lens-scoped Planning list: unarchived rituals (paused ones stay —
 * pause hides from due-ness, not from management), each with today's entry
 * state. Ordered `[order, createdAt]`.
 */
export async function getRitualsData(
  entities: Pick<RitualEntities, "Ritual" | "RitualEntry">,
  { userId, lensId, today }: { userId: string; lensId: string; today: PlainDate },
): Promise<RitualListRow[]> {
  const rituals = await entities.Ritual.findMany({
    where: { userId, lensId, includePaused: true },
  });
  return joinEntryToday(entities, rituals, today, userId);
}

/**
 * Today's due set across every lens (universal like Today): unpaused,
 * unarchived, `isDueOn` today, each row carrying its lens pill name and
 * checked state. The Rituals section renders nothing when this is empty.
 */
export async function getTodayRitualsData(
  entities: RitualEntities,
  { userId, today, timeZone = "UTC" }: { userId: string; today: PlainDate; timeZone?: string },
): Promise<TodayRitualRow[]> {
  const [rituals, lensNames] = await Promise.all([
    entities.Ritual.findMany({ where: { userId } }),
    entities.Lens.findNames({ where: { userId } }),
  ]);
  const nameById = new Map(lensNames.map((l) => [l.id, l.name]));
  const due = rituals.filter(
    (r) =>
      r.pausedAt === null &&
      r.archivedAt === null &&
      isDueOn(r, today, timeZone),
  );
  const entries = await entriesFor(entities, due.map((r) => r.id), today, userId);
  const entryByRitual = new Map(entries.map((e) => [e.ritualId, e]));
  return due.map((r) => {
    const entry = entryByRitual.get(r.id);
    return {
      ...r,
      lensName: nameById.get(r.lensId) ?? null,
      checked: !!entry,
      mood: entry?.mood ?? null,
      note: entry?.note ?? null,
    };
  });
}

async function entriesFor(
  entities: Pick<RitualEntities, "RitualEntry">,
  ritualIds: string[],
  today: PlainDate,
  userId: string,
): Promise<RitualEntryRow[]> {
  if (ritualIds.length === 0) return [];
  const rows = await entities.RitualEntry.findMany({
    where: { ritualIds, localDate: plainDateToDb(today) },
  });
  // Tenancy belt-and-braces: the unique index already scopes by ritualId;
  // the userId filter keeps a foreign entry from ever joining.
  return rows.filter((e) => e.userId === userId);
}

/** Parse a stored `localDate` back to a calendar day (UTC-midnight Date). */
export function entryLocalDate(entry: Pick<RitualEntryRow, "localDate">): PlainDate {
  return instantToPlainDate(instantFrom(entry.localDate), "UTC");
}

async function joinEntryToday(
  entities: Pick<RitualEntities, "RitualEntry">,
  rituals: RitualRow[],
  today: PlainDate,
  userId: string,
): Promise<RitualListRow[]> {
  const entries = await entriesFor(entities, rituals.map((r) => r.id), today, userId);
  const entryByRitual = new Map(entries.map((e) => [e.ritualId, e]));
  return rituals.map((r) => {
    const entry = entryByRitual.get(r.id);
    return {
      ...r,
      entryToday: entry ? { mood: entry.mood, note: entry.note } : null,
    };
  });
}

// ----------------------------------------------------------------
// Writes
// ----------------------------------------------------------------

export async function createRitualCore(
  entities: Pick<RitualEntities, "Ritual">,
  {
    userId,
    lensId,
    name,
    interval = "MORNING",
    cadence = "DAILY",
    weekday = null,
    intervalDays = null,
    goalId = null,
  }: {
    userId: string;
    lensId: string;
    name: string;
    interval?: RitualInterval;
    cadence?: RitualCadence;
    weekday?: number | null;
    intervalDays?: number | null;
    goalId?: string | null;
  },
): Promise<RitualRow> {
  const fields = validatedCadenceFields(cadence, weekday, intervalDays);
  const previous = await entities.Ritual.findMaxOrder({ where: { userId, lensId } });
  return entities.Ritual.create({
    data: {
      userId,
      lensId,
      name: normalizedName(name),
      interval,
      cadence,
      weekday: fields.weekday,
      intervalDays: fields.intervalDays,
      goalId,
      order: (previous ?? -1) + 1,
    },
  });
}

export async function updateRitualCore(
  entities: Pick<RitualEntities, "Ritual">,
  {
    userId,
    id,
    name,
    interval,
    cadence,
    weekday,
    intervalDays,
    goalId,
  }: {
    userId: string;
    id: string;
    name?: string;
    interval?: RitualInterval;
    cadence?: RitualCadence;
    weekday?: number | null;
    intervalDays?: number | null;
    goalId?: string | null;
  },
): Promise<RitualRow> {
  const current = await requireOwnedRitual(entities, { userId, id });
  const data: RitualUpdateData = {};
  if (name !== undefined) data.name = normalizedName(name);
  if (interval !== undefined) data.interval = interval;
  if (goalId !== undefined) data.goalId = goalId;
  if (cadence !== undefined || weekday !== undefined || intervalDays !== undefined) {
    // Validate the EFFECTIVE combination, then write the caller's fields —
    // plus the nulls a cadence switch must clear (DAILY/WEEKDAYS carry none).
    const effectiveCadence = cadence ?? current.cadence;
    const effective = validatedCadenceFields(
      effectiveCadence,
      weekday !== undefined ? weekday : current.weekday,
      intervalDays !== undefined ? intervalDays : current.intervalDays,
    );
    if (cadence !== undefined) {
      data.cadence = cadence;
      data.weekday = effective.weekday;
      data.intervalDays = effective.intervalDays;
    } else {
      if (weekday !== undefined) data.weekday = effective.weekday;
      if (intervalDays !== undefined) data.intervalDays = effective.intervalDays;
    }
  }
  return entities.Ritual.update({ where: { id }, data });
}

/**
 * Check off a ritual for a local calendar day — an idempotent upsert keyed
 * on the unique `(ritualId, localDate)`: a second complete rewrites the
 * mood/note (re-checking after an uncheck asks again; the modal is the same
 * either way). Both mood and note are optional — completing with nothing
 * entered is a valid check.
 */
export async function completeRitualCore(
  entities: Pick<RitualEntities, "Ritual" | "RitualEntry">,
  {
    userId,
    ritualId,
    localDate,
    mood = null,
    note = null,
  }: {
    userId: string;
    ritualId: string;
    /** UTC-midnight Date (the API derives it from the user's timeZone). */
    localDate: Date;
    mood?: RitualMood | null;
    note?: string | null;
  },
): Promise<RitualEntryRow> {
  await requireOwnedRitual(entities, { userId, id: ritualId });
  const existing = await entities.RitualEntry.findFirst({
    where: { ritualId, localDate },
  });
  const cleanNote = normalizedNote(note);
  if (existing) {
    return entities.RitualEntry.update({
      where: { id: existing.id },
      data: { mood, note: cleanNote },
    });
  }
  return entities.RitualEntry.create({
    data: { ritualId, userId, localDate, mood, note: cleanNote },
  });
}

/**
 * Uncheck — deletes the day's entry, reflection included (ListItem's
 * uncheck-restores semantics). One quiet op: no modal, idempotent by design.
 */
export async function uncheckRitualCore(
  entities: Pick<RitualEntities, "Ritual" | "RitualEntry">,
  {
    userId,
    ritualId,
    localDate,
  }: { userId: string; ritualId: string; localDate: Date },
): Promise<{ ok: true }> {
  await requireOwnedRitual(entities, { userId, id: ritualId });
  await entities.RitualEntry.delete({ where: { ritualId, localDate } });
  return { ok: true };
}

/** Edit a saved reflection (mood/note) in place — the entry must exist. */
export async function updateReflectionCore(
  entities: Pick<RitualEntities, "Ritual" | "RitualEntry">,
  {
    userId,
    ritualId,
    localDate,
    mood,
    note,
  }: {
    userId: string;
    ritualId: string;
    localDate: Date;
    mood: RitualMood | null;
    note: string | null;
  },
): Promise<RitualEntryRow> {
  await requireOwnedRitual(entities, { userId, id: ritualId });
  const existing = await entities.RitualEntry.findFirst({
    where: { ritualId, localDate },
  });
  if (!existing) throw new Error("Ritual is not checked off.");
  return entities.RitualEntry.update({
    where: { id: existing.id },
    data: { mood, note: normalizedNote(note) },
  });
}

/** Pause hides a ritual from due-ness without touching history; resume clears. */
export async function setRitualPausedCore(
  entities: Pick<RitualEntities, "Ritual">,
  { userId, id, paused }: { userId: string; id: string; paused: boolean },
): Promise<RitualRow> {
  await requireOwnedRitual(entities, { userId, id });
  return entities.Ritual.update({
    where: { id },
    data: { pausedAt: paused ? new Date() : null },
  });
}

/** Archive retires a ritual — history stays, the row leaves the active list. */
export async function archiveRitualCore(
  entities: Pick<RitualEntities, "Ritual">,
  { userId, id }: { userId: string; id: string },
): Promise<RitualRow> {
  await requireOwnedRitual(entities, { userId, id });
  return entities.Ritual.update({ where: { id }, data: { archivedAt: new Date() } });
}
