import { createContext, useContext } from "react";

/**
 * The active Lens, shared from AppShell's LensSwitch to every /app page.
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
  /**
   * Stable kind handle (PERSONAL / WORK / CUSTOM). The entitlement guard
   * branches on this, not the name, so renaming a seeded lens can't escape
   * FREE gating. See docs/specs/custom-lenses.md §"Stable handle".
   */
  kind: string;
  /** One short line: what this lens is for. */
  purpose: string | null;
}

export const LensContext = createContext<ActiveLens | null>(null);

/** Read the active lens. Returns null until lenses load or if on a non-app route. */
export function useActiveLens(): ActiveLens | null {
  return useContext(LensContext);
}
