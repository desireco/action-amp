/** Ported verbatim from webapp/src/search/paletteAvailability.ts (S9). */
export type PaletteBlockers = {
  working: boolean;
  triage: boolean;
  capture: boolean;
  shortcuts: boolean;
  confirmation: boolean;
  feedback: boolean;
  mobileLens: boolean;
  palette: boolean;
};

/** Blocking overlays/modes win. The non-blocking desktop Lens popover is omitted. */
export function isPaletteBlocked(blockers: PaletteBlockers): boolean {
  return Object.values(blockers).some(Boolean);
}
