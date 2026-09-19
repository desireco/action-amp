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
  .input(z.object({}).strict())
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

/** The rituals namespace — paths: POST /rpc/rituals/{list,today,…}. */
export const ritualsContract = {
  list: listRituals,
  today: todayRituals,
  create: createRitual,
  update: updateRitual,
  complete: completeRitual,
  uncheck: uncheckRitual,
  updateReflection: updateRitualReflection,
  setPaused: setRitualPaused,
  archive: archiveRitual,
};
