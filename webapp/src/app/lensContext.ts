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
}

export const LensContext = createContext<ActiveLens | null>(null);

/** Read the active lens. Returns null until lenses load or if on a non-app route. */
export function useActiveLens(): ActiveLens | null {
  return useContext(LensContext);
}
