/**
 * Lenses store — the S7 lens surface's data client (F9a class-singleton
 * pattern): the switcher's active-lens state (localStorage "aa-lens-id", the
 * webapp AppShell's id-keyed persistence), the FREE gate on locked lenses,
 * and the Settings Lenses tab's CRUD. All server contact goes through the
 * client in `../api`.
 *
 * Lens switching re-scopes the app: `switch()` re-reads appData (lenses +
 * nav counts) and mirrors the active lens's identity color onto
 * `<html data-lens>`. Screens consume `lenses.activeLensId` / `lenses.appData`
 * (see docs/plans/slices/s7-s11-wiring.md for the per-screen migration notes —
 * the S1/S4 stores still hold their own appData copies).
 */
import { client } from "../api";
import type { AppData } from "../dto";
import { prefs, type Account } from "./prefs.svelte";

/** Pro's soft lens cap (webapp billing/config PRO_LIMITS.lenses). */
export const LENS_PRO_LIMIT = 8;

/** The Work-lens ProGate copy (webapp billing entitlements WORK_LENS_MESSAGE). */
export const WORK_LENS_GATE = {
  feature: "another Lens",
  reason: "organize more areas of your life with Pro",
} as const;

/** The FREE lens-tab gate copy (webapp LensesPage's ProGate props). */
export const CUSTOM_LENSES_GATE = {
  feature: "Custom lenses",
  reason:
    "Keep one context for work, one for life — or add a Studio, a side project, a board role. Each lens carries its own focus.",
} as const;

export interface GateMessage {
  feature: string;
  reason: string;
}

/** One lens row in the Settings Lenses tab (the contract's LensSummary). */
export interface LensSummary {
  id: string;
  name: string;
  isDefault: boolean;
  isIncluded: boolean;
  color: string | null;
  purpose: string | null;
  hasAnyContent: boolean;
  blockingProjects: { id: string; name: string }[];
  counts: { goals: number; projects: number; tasks: number };
}

export interface LensCreated {
  id: string;
  name: string;
  isDefault: boolean;
  isIncluded: boolean;
  color: string | null;
  purpose: string | null;
}

interface LensesClientSlice {
  list(): Promise<LensSummary[]>;
  create(input: {
    name: string;
    color?: string | null;
    purpose?: string;
  }): Promise<LensCreated>;
  update(input: {
    id: string;
    name?: string;
    purpose?: string;
    color?: string | null;
  }): Promise<LensCreated>;
  delete(input: {
    id: string;
    mode: "delete" | "reassign";
    targetLensId?: string;
  }): Promise<{ id: string }>;
}

const rpc = (client as unknown as { lenses: LensesClientSlice }).lenses;

/**
 * Server-error surfacing, ported from webapp LensesPage's
 * operationErrorMessage: prefers `data.reason` (the 402 payload), then the
 * message (the 409/404/400 strings ride there verbatim), then a fallback.
 */
export function operationErrorMessage(err: unknown, fallback: string): string {
  // SAFETY: double/wide assertion needed — runtime shape is verified.
  const e = err as { data?: { reason?: string }; message?: string };
  const data = e?.data;
  if (data && typeof data.reason === "string") return data.reason;
  if (typeof e?.message === "string" && e.message.trim()) return e.message;
  return fallback;
}

/** Extract the 402's `{ feature, reason }` payload (null when not a gate). */
export function gateFromError(err: unknown): GateMessage | null {
  const data = (err as { data?: { feature?: string; reason?: string } })?.data;
  if (data && typeof data.feature === "string" && typeof data.reason === "string") {
    return { feature: data.feature, reason: data.reason };
  }
  return null;
}

/**
 * The entitlement-aware no-preference default (the webapp AppShell chain):
 * an entitled user lands on the first-created lens (the seeded Work lens);
 * a FREE user on the included one (Me — a locked lens would 402 every
 * scoped query). The shared helper is what every screen-side fallback uses
 * too, so a pre-shell-load snap always agrees with the shell's own choice.
 */
export function entitlementDefaultLensId(
  list: { id: string; isIncluded?: boolean }[],
  account: Account | null,
): string | null {
  if (list.length === 0) return null;
  if (account?.entitled ?? true) return list[0].id;
  return (list.find((l) => l.isIncluded) ?? list[0]).id;
}

class LensesStore {
  /** App-shell mirror: the bootstrap payload (lenses + counts). */
  appData = $state<AppData | null>(null);
  /** Active lens id — persisted (webapp "aa-lens-id"), self-heals to first. */
  activeLensId = $state<string | null>(null);
  /** The FREE gate shown instead of switching (webapp AppShell workGated). */
  gate = $state<GateMessage | null>(null);

  /** Settings Lenses tab rows. */
  rows = $state<LensSummary[]>([]);
  loading = $state(false);
  loaded = $state(false);
  error = $state<string | null>(null);

  get lenses(): NonNullable<AppData["lenses"]> {
    return this.appData?.lenses ?? [];
  }

  /** The active lens row (first lens until lenses load — webapp fallback). */
  get active(): AppData["lenses"][number] | null {
    const lenses = this.lenses;
    return (
      lenses.find((l) => l.id === this.activeLensId) ??
      // FREE default: the included lens, never a locked one (webapp parity).
      lenses.find((l) => l.isIncluded) ??
      lenses[0] ??
      null
    );
  }

  /** Entitlement per the Account read (lenses gate is whole-account Pro). */
  entitled(account: Account | null): boolean {
    return account?.entitled ?? true;
  }

  /** Request token: a newer load/switch supersedes an in-flight one, so a
   *  slow response can never land stale counts over a fresh lens. */
  #loadSeq = 0;

  /**
   * Bootstrap: load appData, restore the stored lens, self-heal stale ids.
   * The Account read and the appData read run in PARALLEL — the choice only
   * needs the entitlement flag when there is no stored id, and serializing
   * the two doubled the time to activeLensId (screen first-loads raced it).
   *
   * The read is scoped to the active lens (webapp parity — AppShell passed
   * `{ lensId: rawId }` so switching re-read re-scopes the sidebar's
   * Upcoming/Someday pills; the server's no-id fallback is lenses[0], which
   * is not the lens a FREE user — or a switch — lands on).
   */
  async loadAppData(): Promise<void> {
    const seq = ++this.#loadSeq;
    try {
      const accountReady = prefs.account ? Promise.resolve() : prefs.loadAccount();
      const requested = this.activeLensId ?? undefined;
      let appData: AppData;
      try {
        appData = await Promise.all([
          accountReady,
          client.tasks.appData({ lensId: requested }),
        ]).then(([, data]) => data);
      } catch {
        // A stored id the account can no longer use (a lapsed plan's locked
        // lens → 402) must not take the bootstrap down — retry unscoped and
        // let the entitlement clamp below re-point the lens.
        appData = await client.tasks.appData({});
      }
      if (seq !== this.#loadSeq) return;
      this.appData = appData;
      const stored = typeof localStorage !== "undefined" ? localStorage.getItem("aa-lens-id") : null;
      const storedLens = stored
        ? appData.lenses.find((l) => l.id === stored)
        : undefined;
      // Entitlement clamp (webapp AppShell parity): a stored id pointing at a
      // lens the account can't use (a bypass attempt, or stale from a lapsed
      // plan) falls back to the default so scoped queries don't 402.
      const usable =
        storedLens && (this.entitled(prefs.account) || storedLens.isIncluded);
      this.activeLensId = usable ? storedLens.id : this.defaultLensId();
      if (this.activeLensId !== stored) this.persistActive();
      // Counts re-scope: the fetch above assumed `requested`; when the lens
      // actually resolved differs (first boot, stale id, the FREE default),
      // re-read once scoped to it so the sidebar pills follow the lens.
      if (seq !== this.#loadSeq) return;
      if (this.activeLensId && this.activeLensId !== requested) {
        this.appData = await client.tasks.appData({ lensId: this.activeLensId });
        if (seq !== this.#loadSeq) return;
      }
      this.mirrorLensColor();
      // A stale error (a pre-login 401 from an earlier boot) must never
      // outlive a successful load.
      this.error = null;
    } catch (e) {
      if (seq !== this.#loadSeq) return;
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Early hydration: a stored id becomes active BEFORE appData lands, so on
   * repeat visits no screen can race the shell's choice. loadAppData still
   * validates the id and self-heals a stale one.
   */
  hydrateStoredLens(): void {
    if (this.activeLensId) return;
    const stored =
      typeof localStorage !== "undefined" ? localStorage.getItem("aa-lens-id") : null;
    if (stored) this.activeLensId = stored;
  }

  /**
   * The no-preference default — delegates to entitlementDefaultLensId (the
   * webapp AppShell resolution chain, branch on ENTITLEMENT, never the name).
   */
  private defaultLensId(): string | null {
    return entitlementDefaultLensId(this.lenses, prefs.account);
  }

  private persistActive() {
    if (typeof localStorage !== "undefined" && this.activeLensId) {
      localStorage.setItem("aa-lens-id", this.activeLensId);
    }
  }

  /** Mirror the active lens's identity color onto <html data-lens> (AppShell
   *  parity — identity only, never system/state). */
  private mirrorLensColor() {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.lens = this.active?.color || "indigo";
  }

  /**
   * Switch the active lens. A FREE user picking a non-included lens sees the
   * ProGate instead of switching (the friendly surface; the server 402 is the
   * boundary). Branches on isIncluded, never the name (rename-safety).
   */
  async switch(id: string, account: Account | null): Promise<void> {
    const target = this.lenses.find((l) => l.id === id);
    if (!this.entitled(account) && target && !target.isIncluded) {
      this.gate = { ...WORK_LENS_GATE };
      return;
    }
    this.gate = null;
    this.activeLensId = id;
    this.persistActive();
    this.mirrorLensColor();
    await this.loadAppData();
  }

  // ----------------------------------------------------------------
  // Settings Lenses tab
  // ----------------------------------------------------------------

  async loadRows(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.rows = await rpc.list();
      this.loaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /** After any lens mutation: refresh BOTH the tab rows and the app-shell
   *  mirror (webapp invalidated getLenses + getAppData). */
  async refresh(): Promise<void> {
    await Promise.all([this.loadRows(), this.loadAppData()]);
  }

  async create(input: { name: string; color?: string | null; purpose?: string }) {
    return await rpc.create(input);
  }

  async update(input: { id: string; name?: string; purpose?: string; color?: string | null }) {
    return await rpc.update(input);
  }

  async remove(id: string, mode: "delete" | "reassign", targetLensId?: string) {
    return await rpc.delete({ id, mode, targetLensId });
  }
}

export const lenses = new LensesStore();
