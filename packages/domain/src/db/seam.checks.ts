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
import {
  createProjectCore,
  createTaskCore,
  getProjectData,
  getProjectsData,
} from "../projects/operationsCore.js";
import {
  archiveProjectCore,
  deleteProjectCore,
  moveProjectCore,
  setProjectDoneCore,
  updateProjectCore,
  updateTaskParentCore,
} from "../projects/lifecycleCore.js";
import { assertLensAllowed, assertStandardProject } from "../projects/guards.js";
import { createGoalCore, getGoalData, getGoalsData } from "../goals/operationsCore.js";
import {
  deleteGoalCore,
  reorderGoalProjectsCore,
  setGoalDoneCore,
  updateGoalCore,
} from "../goals/lifecycleCore.js";
import { createInboxItemCore, getInboxItemsCore, triageInboxItemCore } from "../inbox/operationsCore.js";
import { getLogbookData } from "../logbook/operationsCore.js";
import { getLensCore, getLensesCore } from "../lenses/operationsCore.js";
import { createLensCore, deleteLensCore, updateLensCore } from "../lenses/lifecycleCore.js";
// S9 — sitewide search + the project resource CRUD.
import {
  getCommandPaletteIndexData,
  searchSiteData,
} from "../search/operationsCore.js";
import { createResourceCore } from "../resources/operationsCore.js";
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
  // S5 — projects
  expectEntities(getProjectsData, entities);
  expectEntities(getProjectData, entities);
  expectEntities(createProjectCore, entities);
  expectEntities(createTaskCore, entities);
  expectEntities(setProjectDoneCore, entities);
  expectEntities(archiveProjectCore, entities);
  expectEntities(moveProjectCore, entities);
  expectEntities(updateProjectCore, entities);
  expectEntities(deleteProjectCore, entities);
  expectEntities(updateTaskParentCore, entities);
  expectEntities(assertLensAllowed, entities);
  expectEntities(assertStandardProject, entities);
  // S6 — goals
  expectEntities(getGoalsData, entities);
  expectEntities(getGoalData, entities);
  expectEntities(createGoalCore, entities);
  expectEntities(setGoalDoneCore, entities);
  expectEntities(updateGoalCore, entities);
  expectEntities(deleteGoalCore, entities);
  expectEntities(reorderGoalProjectsCore, entities);
  expectEntities(resolveAccessibleLenses, entities);
  // S2+S3 — capture, the inbox list, and the triage orchestrator.
  expectEntities(createInboxItemCore, entities);
  expectEntities(getInboxItemsCore, entities);
  expectEntities(triageInboxItemCore, entities);
  // S8 — the Logbook's five projected reads.
  expectEntities(getLogbookData, entities);
  // S7/S11 — the lens reads + CRUD (the write guard is guard-only, no
  // entities; deleteLensCore's third arg is the injected LensTxRunner).
  expectEntities(getLensesCore, entities);
  expectEntities(getLensCore, entities);
  expectEntities(createLensCore, entities);
  expectEntities(updateLensCore, entities);
  expectEntities(deleteLensCore, entities);
  // S9 — the search reads (loose slice, mirrors the webapp core) + the
  // resource CRUD core.
  expectEntities(searchSiteData, entities);
  expectEntities(getCommandPaletteIndexData, entities);
  expectEntities(createResourceCore, entities);
}
