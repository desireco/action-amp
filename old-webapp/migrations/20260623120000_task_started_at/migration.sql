/*
  Add Task.startedAt — the "Now" state pointer.

  null = Next (candidate, not being worked on). non-null = Now (in progress,
  persists across navigation). getTopTask orders startedAt != null first so an
  in-progress task always surfaces as #1. Cleared on done/defer/pause.
*/
ALTER TABLE "Task" ADD COLUMN "startedAt" TIMESTAMP(3);
