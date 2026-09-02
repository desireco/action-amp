// S2+S3 — public export barrel for the inbox core. Same pattern as
// src/tasks/index.ts: star re-exports, one line per module, so apps import
// `@actionamp/domain/inbox` instead of reaching into the package's internal
// paths.
export * from './operationsCore.js';
