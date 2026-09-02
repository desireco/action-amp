// F4b — compile-time seam lock.
//
// Asserts that the seam `Entities` (createEntities, ./client.ts) satisfies
// every ported core's entities slice — i.e. that the API layer (F8b) can pass
// ONE entities object to every core, and that F4c's mocks have a stable
// contract. Each `expectEntities` call below must compile: if a core slice
// drifts from the seam delegates, the matching call fails `bunx tsc`.
//
// (Function-argument checks, not `[A] extends [B]` conditional tuples — the
// conditional form mis-resolves when overload-heavy delegate slices are
// compared in bulk in one file. Argument position is also the exact relation
// F8b depends on: it passes `createEntities(db)` into each core.)
//
// Nothing imports this module; it exists to be typechecked
// (`cd packages/domain && bunx tsc --noEmit`) and read.
import {
  completeFocusSessionCore,
  getDoneTodayData,
  getOtherLensCountsData,
  getTaskAlternativesData,
  getTaskData,
  getTasksData,
  getTodayTasksData,
  getTopTaskData,
  getWeekTasksData,
  hydrateTopTaskData,
  pauseTaskCore,
  snoozeTaskCore,
  startTaskCore,
  toggleTaskDoneCore,
  updateTaskStatusCore,
} from "../tasks/operationsCore.js";
import { resolveAccessibleLenses, resolveLens } from "../billing/entitlements.js";
import type { Entities } from "./seam.js";

function expectEntities<F>(
  core: (entities: F, ...rest: never[]) => unknown,
  entities: F,
): void {
  void core;
  void entities;
}

/** Compile-only: every call pins the seam entities to one core's slice. */
export function seamLocks(entities: Entities): void {
  expectEntities(getTaskData, entities);
  expectEntities(getTasksData, entities);
  expectEntities(getTodayTasksData, entities);
  expectEntities(getWeekTasksData, entities);
  expectEntities(getDoneTodayData, entities);
  expectEntities(getTopTaskData, entities);
  expectEntities(getTaskAlternativesData, entities);
  expectEntities(getOtherLensCountsData, entities);
  expectEntities(hydrateTopTaskData, entities);
  expectEntities(toggleTaskDoneCore, entities);
  expectEntities(snoozeTaskCore, entities);
  expectEntities(updateTaskStatusCore, entities);
  expectEntities(startTaskCore, entities);
  expectEntities(completeFocusSessionCore, entities);
  expectEntities(pauseTaskCore, entities);
  expectEntities(resolveLens, entities);
  expectEntities(resolveAccessibleLenses, entities);
}
