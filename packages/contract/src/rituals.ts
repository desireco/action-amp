/**
 * The rituals contract — the habits layer (docs/specs/rituals.md, locked
 * 2026-09-15). Rituals are a first-class lens-scoped entity with check-off
 * semantics only: no Next candidacy, no focus mode, no minted Tasks.
 *
 * Wire conventions match goals.ts/projects.ts (ISO strings for temporals,
 * declared errors). EVERY op — reads included — carries `ProGateErrorMap`:
 * Rituals are Pro-only with no free-tier count, and a downgrade preserves
 * data losslessly while gating ops (FREE answers 402 `{feature, reason}`;
 * the web renders the ProGate panel without calling).
 *
 * The day is always the SERVER's derivation from the user's persisted IANA
 * timeZone — complete/uncheck/updateReflection take no date input, so a
 * client can never write a foreign calendar day.
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

import { ProGateErrorMap } from "./projects.js";

const datetime = () => z.string();

/** The daily slot — an assignment and a grouping on Today, not an alarm. */
export const RitualIntervalSchema = z.enum(["MORNING", "MIDDAY", "EVENING"]);

/** The four cadence shapes — no RRULE, ever. */
export const RitualCadenceSchema = z.enum(["DAILY", "WEEKDAYS", "WEEKLY", "INTERVAL"]);

/** Optional reflection facts — plain facts, never judgment. */
export const RitualMoodSchema = z.enum(["HAPPY", "NEUTRAL", "NEGATIVE"]);

export type RitualInterval = z.infer<typeof RitualIntervalSchema>;
export type RitualCadence = z.infer<typeof RitualCadenceSchema>;
export type RitualMood = z.infer<typeof RitualMoodSchema>;

/** Today's reflection, when the ritual is already checked. */
export const RitualEntryStateSchema = z.object({
  mood: RitualMoodSchema.nullable(),
  note: z.string().nullable(),
});

/** The Planning-page row (`getRitualsData`'s output). */
export const RitualSchema = z.object({
  id: z.string(),
  name: z.string(),
  lensId: z.string(),
  interval: RitualIntervalSchema,
  cadence: RitualCadenceSchema,
  /** 0–6 ISO order (Mon = 0) — read when cadence = WEEKLY. */
  weekday: z.number().int().min(0).max(6).nullable(),
  /** 2–365 — read when cadence = INTERVAL. */
  intervalDays: z.number().int().min(2).max(365).nullable(),
  /** Definition fields (markdown): what to do / what you get. */
  guidance: z.string().max(500).nullable(),
  benefit: z.string().max(500).nullable(),
  goalId: z.string().nullable(),
  order: z.number().int(),
  /** Pause hides from due-ness without touching history. */
  paused: z.boolean(),
  createdAt: datetime(),
  updatedAt: datetime(),
  entryToday: RitualEntryStateSchema.nullable(),
});

/** The Today-section row (`getTodayRitualsData`'s output) — due, with the
 *  lens pill name and the checked state (+ saved reflection when present). */
export const TodayRitualSchema = RitualSchema.omit({ entryToday: true }).extend({
  lensName: z.string().nullable(),
  checked: z.boolean(),
  mood: RitualMoodSchema.nullable(),
  note: z.string().nullable(),
});

/**
 * The lens-scoped Planning list (unarchived; paused rows stay managed).
 * Server falls back to the first included lens (Me) when lensId is absent —
 * the ritual-creation default.
 */
export const listRituals = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1).optional() }))
  .output(z.array(RitualSchema));

/** Today's due set across every lens (universal like Today). 402 for FREE. */
export const todayRituals = oc
  .errors(ProGateErrorMap)
  .output(z.array(TodayRitualSchema));

/**
 * Create a ritual. Defaults: interval MORNING, cadence DAILY, lens Me.
 * WEEKLY requires `weekday`; INTERVAL requires `intervalDays` (2–365).
 */
export const createRitual = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      name: z.string().min(1),
      lensId: z.string().min(1).optional(),
      interval: RitualIntervalSchema.optional(),
      cadence: RitualCadenceSchema.optional(),
      weekday: z.number().int().min(0).max(6).nullable().optional(),
      intervalDays: z.number().int().min(2).max(365).nullable().optional(),
      guidance: z.string().max(500).nullable().optional(),
      benefit: z.string().max(500).nullable().optional(),
      goalId: z.string().nullable().optional(),
    }),
  )
  .output(z.object({ id: z.string(), name: z.string() }));

/** Edit name/interval/cadence/goal. Absent fields stay; null clears. */
export const updateRitual = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      interval: RitualIntervalSchema.optional(),
      cadence: RitualCadenceSchema.optional(),
      weekday: z.number().int().min(0).max(6).nullable().optional(),
      intervalDays: z.number().int().min(2).max(365).nullable().optional(),
      guidance: z.string().max(500).nullable().optional(),
      benefit: z.string().max(500).nullable().optional(),
      goalId: z.string().nullable().optional(),
    }),
  )
  .output(z.object({ id: z.string() }));

/**
 * Check off today (the local day derived server-side). Idempotent upsert —
 * a repeat rewrites the reflection. Mood + note both optional; completing
 * with nothing entered is a valid check.
 */
export const completeRitual = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      id: z.string(),
      mood: RitualMoodSchema.nullable().optional(),
      note: z.string().max(500).nullable().optional(),
    }),
  )
  .output(z.object({ id: z.string() }));

/** Uncheck today — deletes the entry, reflection included. One quiet op. */
export const uncheckRitual = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }));

/** Edit the saved reflection (the modal over a checked row). */
export const updateRitualReflection = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      id: z.string(),
      mood: RitualMoodSchema.nullable(),
      note: z.string().max(500).nullable(),
    }),
  )
  .output(z.object({ id: z.string() }));

/** Pause hides from due-ness without touching history; resume clears. */
export const setRitualPaused = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string(), paused: z.boolean() }))
  .output(z.object({ id: z.string() }));

/** Archive retires it — history stays for review evidence. */
export const archiveRitual = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }));

/** One checked day in the quiet history read. */
export const RitualHistoryEntrySchema = z.object({
  /** yyyy-MM-dd — the user's calendar day at check time. */
  localDate: z.string(),
  mood: RitualMoodSchema.nullable(),
  note: z.string().nullable(),
  createdAt: datetime(),
});

/**
 * A ritual's checked days, newest first (the Planning page's history toggle
 * + `ritual show`). Evidence only — exactly as recorded, never aggregated.
 */
export const ritualHistory = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string() }))
  .output(z.array(RitualHistoryEntrySchema));

/** The retired set (the Archived section) — history stays reachable. */
export const archivedRituals = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1).optional() }))
  .output(z.array(RitualSchema.omit({ entryToday: true })));

/** Restore un-retires an archived ritual (back on the active list). */
export const restoreRitual = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }));

/**
 * Hard-delete an ARCHIVED ritual (entries cascade with it). Active rituals
 * answer 400 "Only archived rituals can be deleted." — archive first.
 */
export const deleteRitual = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }));

/** Sequence the lens's active rituals: `order = index` for each id
 *  (full-array write, the drag-and-drop + goals-reorder precedent). */
export const reorderRituals = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      lensId: z.string().min(1).optional(),
      orderedIds: z.array(z.string()).min(1),
    }),
  )
  .output(z.object({ lensId: z.string() }));

/** The rituals namespace — paths: POST /rpc/rituals/{list,today,…}. */
export const ritualsContract = {
  list: listRituals,
  today: todayRituals,
  history: ritualHistory,
  archived: archivedRituals,
  create: createRitual,
  update: updateRitual,
  complete: completeRitual,
  uncheck: uncheckRitual,
  updateReflection: updateRitualReflection,
  setPaused: setRitualPaused,
  archive: archiveRitual,
  restore: restoreRitual,
  delete: deleteRitual,
  reorder: reorderRituals,
};
