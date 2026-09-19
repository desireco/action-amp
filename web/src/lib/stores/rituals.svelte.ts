/**
 * Rituals store — the habits layer's data client (docs/specs/rituals.md).
 * DTO interfaces mirror the contract's Ritual / TodayRitual schemas 1:1.
 *
 * Entitlement: Rituals are Pro-only, so the store never issues a call for a
 * FREE account — the views read `blocked` (from prefs.account) and render
 * the ProGate panel instead; the server 402s every op regardless.
 */

import { client } from "../api";
import { lenses } from "./lenses.svelte";
import { prefs } from "./prefs.svelte";
import { gateFromError, messageFromError, type GateMessage } from "./projects.svelte";

/** Client slice for the rituals procedures (the goals-store bridge pattern). */
interface RitualsClientSlice {
  list(input?: { lensId?: string }): Promise<Ritual[]>;
  today(): Promise<TodayRitual[]>;
  create(input: {
    name: string;
    lensId?: string;
    interval?: RitualInterval;
    cadence?: RitualCadence;
    weekday?: number | null;
    intervalDays?: number | null;
    guidance?: string | null;
    benefit?: string | null;
    goalId?: string | null;
  }): Promise<{ id: string; name: string }>;
  update(input: {
    id: string;
    name?: string;
    interval?: RitualInterval;
    cadence?: RitualCadence;
    weekday?: number | null;
    intervalDays?: number | null;
    guidance?: string | null;
    benefit?: string | null;
    goalId?: string | null;
  }): Promise<{ id: string }>;
  complete(input: {
    id: string;
    mood?: RitualMood | null;
    note?: string | null;
  }): Promise<{ id: string }>;
  uncheck(input: { id: string }): Promise<{ id: string }>;
  updateReflection(input: {
    id: string;
    mood: RitualMood | null;
    note: string | null;
  }): Promise<{ id: string }>;
  setPaused(input: { id: string; paused: boolean }): Promise<{ id: string }>;
  archive(input: { id: string }): Promise<{ id: string }>;
}

const rpc = (client as unknown as { rituals: RitualsClientSlice }).rituals;

export type RitualInterval = "MORNING" | "MIDDAY" | "EVENING";
export type RitualCadence = "DAILY" | "WEEKDAYS" | "WEEKLY" | "INTERVAL";
export type RitualMood = "HAPPY" | "NEUTRAL" | "NEGATIVE";

/** The Planning-page row (`rituals.list` output). */
export interface Ritual {
  id: string;
  name: string;
  lensId: string;
  interval: RitualInterval;
  cadence: RitualCadence;
  weekday: number | null;
  intervalDays: number | null;
  /** Definition fields (markdown): what to do / what you get. */
  guidance: string | null;
  benefit: string | null;
  goalId: string | null;
  order: number;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
  entryToday: { mood: RitualMood | null; note: string | null } | null;
}

/** The Today-section row (`rituals.today` output) — due, with checked state. */
export interface TodayRitual extends Omit<Ritual, "entryToday"> {
  lensName: string | null;
  checked: boolean;
  mood: RitualMood | null;
  note: string | null;
}

export const INTERVAL_LABELS: Record<RitualInterval, string> = {
  MORNING: "Morning",
  MIDDAY: "Midday",
  EVENING: "Evening",
};

/** The cadence chip's calm one-liner, e.g. "Fridays" / "Every 3 days". */
export function cadenceLabel(r: Pick<Ritual, "cadence" | "weekday" | "intervalDays">): string {
  switch (r.cadence) {
    case "DAILY":
      return "Every day";
    case "WEEKDAYS":
      return "Weekdays";
    case "WEEKLY":
      return `${["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][r.weekday ?? 0]}`;
    case "INTERVAL":
      return `Every ${r.intervalDays ?? "?"} day${r.intervalDays === 1 ? "" : "s"}`;
  }
}

class RitualsStore {
  /** Planning list (lens-scoped, paused rows included). */
  rituals = $state<Ritual[]>([]);
  /** Today's due set (all lenses, with checked state). */
  today = $state<TodayRitual[]>([]);
  error = $state<string | null>(null);
  busy = $state(false);
  loaded = $state(false);
  todayLoaded = $state(false);
  /** The lens scope the current `rituals` rows were loaded with. */
  loadedLensId = $state<string | null>(null);

  /** Whole-feature Pro gate — FREE renders ProGate and never calls. */
  get blocked(): boolean {
    return !(prefs.account?.entitled ?? true);
  }

  /** The Me lens — creation's default (the included one), per the spec. */
  get meLensId(): string | null {
    return lenses.lenses.find((l) => l.isIncluded)?.id ?? null;
  }

  async load() {
    if (this.busy || this.blocked) return;
    this.busy = true;
    this.error = null;
    try {
      const lensId = lenses.activeLensId ?? undefined;
      this.rituals = await rpc.list({ lensId });
      this.loadedLensId = lensId ?? null;
      this.loaded = true;
    } catch (e) {
      this.error = messageFromError(e);
    } finally {
      this.busy = false;
      if ((lenses.activeLensId ?? null) !== this.loadedLensId) void this.load();
    }
  }

  async loadToday() {
    if (this.blocked) return;
    try {
      this.today = await rpc.today();
      this.todayLoaded = true;
    } catch (e) {
      // The strip renders nothing on failure — never noisy on Today.
      console.error("[rituals] loadToday failed:", e instanceof Error ? e.message : e);
      this.today = [];
    }
  }

  async refreshToday() {
    await this.loadToday();
  }

  async create(input: {
    name: string;
    lensId?: string;
    interval?: RitualInterval;
    cadence?: RitualCadence;
    weekday?: number | null;
    intervalDays?: number | null;
    guidance?: string | null;
    benefit?: string | null;
  }): Promise<{ ok: true } | { ok: false; gate: GateMessage | null; message: string }> {
    try {
      await rpc.create(input);
      await this.load();
      return { ok: true };
    } catch (e) {
      return { ok: false, gate: gateFromError(e), message: messageFromError(e) };
    }
  }

  async update(input: {
    id: string;
    name?: string;
    interval?: RitualInterval;
    cadence?: RitualCadence;
    weekday?: number | null;
    intervalDays?: number | null;
    guidance?: string | null;
    benefit?: string | null;
  }): Promise<string | null> {
    try {
      await rpc.update(input);
      await this.load();
      return null;
    } catch (e) {
      return messageFromError(e);
    }
  }

  /** Check off (opens nothing — the dialog calls this with its result). */
  async complete(
    id: string,
    mood: RitualMood | null,
    note: string | null,
  ): Promise<string | null> {
    try {
      const alreadyChecked = this.today.find((r) => r.id === id)?.checked ?? false;
      if (alreadyChecked) {
        await rpc.updateReflection({ id, mood, note });
      } else {
        await rpc.complete({ id, mood, note });
      }
      await this.loadToday();
      return null;
    } catch (e) {
      return messageFromError(e);
    }
  }

  /** One quiet tap — deletes the day's entry, reflection included. */
  async uncheck(id: string): Promise<void> {
    try {
      await rpc.uncheck({ id });
      await this.loadToday();
    } catch {
      // Never noisy: a failed uncheck just leaves the row checked.
    }
  }

  async setPaused(id: string, paused: boolean): Promise<void> {
    try {
      await rpc.setPaused({ id, paused });
      await this.load();
      await this.loadToday();
    } catch {
      // Planning rows refresh on next load; a failed toggle is quiet.
    }
  }

  async archive(id: string): Promise<void> {
    try {
      await rpc.archive({ id });
      await this.load();
      await this.loadToday();
    } catch {
      // Same quiet stance.
    }
  }
}

export const rituals = new RitualsStore();
