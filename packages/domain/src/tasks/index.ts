// F8b — public export barrel for the tasks core. Same pattern as src/db/index.ts:
// star re-exports, one line per module. Frozen core files stay untouched; this
// file only aggregates them so apps import `@actionamp/domain/tasks` instead of
// reaching into the package's internal paths.
export * from './operationsCore.js';
export * from './activePool.js';
// S1+S4 batch — additive barrel lines for the new task cores (frozen core
// files untouched; this file only aggregates).
export * from './taskExtrasCore.js';
export * from './appDataCore.js';
export * from './extrasEntities.js';
export * from './focusedTask.js';
