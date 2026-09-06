import { createContext, useContext } from "react";

/**
 * The active Lens, shared from AppShell's LensSwitch to every /do page.
 *
 * Pages consume this to scope their queries (e.g. "today's tasks in the Work
 * lens"). AppShell provides it via <LensProvider value={activeLens}>. When the
 * lenses haven't loaded yet, this is null and pages should render a loading /
 * empty state rather than query with a null lensId.
 */
export interface ActiveLens {
  id: string;
  name: string;
  /**
   * Identity color key (e.g. "indigo", "emerald") — see styles/tokens.css's
   * `--aa-lens-*` palette. Null for lenses seeded before colors existed; the
   * client falls back to indigo (the :root `--aa-active-lens*` default).
   * Identity only, never system/state. Widgets that want to paint per-lens
   * stamp `data-lens-color` on a node and let CSS re-point `--aa-active-lens*`
   * locally (see LensSwitch, TriagePage context radio).
   */
  color: string | null;
  /** Whether this is the Lens included with the Free plan. */
  isIncluded?: boolean;
  /** One short line: what this lens is for. */
  purpose: string | null;
}

export const LensContext = createContext<ActiveLens | null>(null);

/**
 * The AppShell's guarded lens switcher (FREE-plan gating included), shared so
 * pages can offer a lens switch in place — e.g. the Next empty state's
 * "Work · 3 on the table" pointer. Null outside the app shell; callers treat
 * that as "no switch available" and render plain text.
 */
export const LensSwitchContext = createContext<((id: string) => void) | null>(
  null,
);

/** Read the active lens. Returns null until lenses load or if on a non-app route. */
export function useActiveLens(): ActiveLens | null {
  return useContext(LensContext);
}

/** Switch the active lens by id. Null until the app shell mounts. */
export function useLensSwitch(): ((id: string) => void) | null {
  return useContext(LensSwitchContext);
}
