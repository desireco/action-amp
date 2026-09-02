/**
 * @actionamp/contract — the sole API surface for clients (web, any future
 * consumers). Apps import from here only; never from `@orpc/*` directly.
 */

export type { Priority, Router, Task, TaskStatus } from "./router-type.js";
export {
  createClient,
  createMockClient,
  type CreateClientOptions,
  type MockRouter,
  type RouterClient,
  type RouterInputs,
  type RouterOutputs,
} from "./client.js";

// S1+S4 (What Now + tasks/lists) fragment — additive exports of the slice's
// own schemas only (SizeSchema already ships via the inbox fragment, so it is
// not repeated here); the `tasks:` composition line already exists in
// src/router.ts, so this slice adds no new composition.
export {
  tasksContract,
  AppDataSchema,
  FocusedTaskSchema,
  ListItemSchema,
  ListProjectSchema,
  PrioritySchema,
  RankedTaskSchema,
  SnoozePresetSchema,
  TaskDetailSchema,
  TaskFullSchema,
  TaskLensListRowSchema,
  TaskListRowSchema,
  TaskSchema,
  TaskStatusSchema,
  TaskUpdateKindSchema,
  WhatNowTaskSchema,
} from "./tasks.js";
// S5/S6 fragments — additive exports of the slice's own schemas only; the
// router composition lines live in docs/plans/slices/s5-s6-wiring.md.
export {
  goalsContract,
  GoalDetailSchema,
  GoalProjectSchema,
  GoalSummarySchema,
} from "./goals.js";
export {
  projectsContract,
  ProjectDetailSchema,
  ProjectDetailTaskSchema,
  ProjectResourceSchema,
  ProjectSummarySchema,
  ProjectTypeSchema,
  ProGateErrorMap,
} from "./projects.js";
// S2+S3 (capture + inbox/triage) fragment — additive exports of the slice's
// own schemas only; the router composition line lives in
// docs/plans/slices/s2-s3-wiring.md.
export {
  inboxContract,
  InboxAttachmentSchema,
  InboxItemSchema,
  InboxItemStatusSchema,
  LensInfoSchema,
  ResolverProjectSchema,
  SizeSchema,
  TriageDecisionSchema,
  TriageResultSchema,
} from "./inbox.js";
export { contractRouter } from "./router.js";
