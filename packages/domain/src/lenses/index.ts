// S7/S11 — the lenses feature: reads (Settings Lenses tab + the CLI's
// list/show precedent), the CRUD lifecycle cores (webapp's lens ops), the
// Pro-config guard, and the drizzle transaction runner for the reassign
// delete.
export {
  getLensesCore,
  getLensCore,
  type LensReadEntities,
  type LensSummary,
  type LensDetail,
} from "./operationsCore.js";
export {
  createLensCore,
  updateLensCore,
  deleteLensCore,
  isLensColor,
  LENS_COLORS,
  type LensColor,
  type LensWriteEntities,
  type LensTxClient,
  type LensTxRunner,
} from "./lifecycleCore.js";
export { createLensTxRunner } from "./lensTx.js";
export { assertLensConfigAllowed, assertLensesUnderCap, type LensGuardUser } from "./guards.js";
