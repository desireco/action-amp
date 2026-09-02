// S1+S4 — public export barrel for the simpleLists core. Same pattern as
// src/tasks/index.ts: star re-exports, one line per module, so apps import
// `@actionamp/domain/simpleLists` instead of reaching into internal paths.
export * from './operationsCore.js';
export * from './entities.js';
