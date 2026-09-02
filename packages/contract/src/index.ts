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
// S7+S11 (lenses + prefs) fragments — additive exports of the slice's own
// schemas only; the router composition lines live in
// docs/plans/slices/s7-s11-wiring.md.
export {
  lensesContract,
  LensColorSchema,
  LensCreatedSchema,
  LensSummarySchema,
  LENS_COLORS,
} from "./lenses.js";
export {
  prefsContract,
  FOCUS_SESSION_DEFAULT,
  FOCUS_SESSION_OPTIONS,
  TODAY_CAP_DEFAULT,
  TODAY_CAP_MAX,
  TODAY_CAP_MIN,
} from "./prefs.js";
export type { FocusSessionMinutes } from "./prefs.js";
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
// S8 (Logbook) fragment — additive exports of the slice's own schemas only;
// the router composition line lives in docs/plans/slices/s8-wiring.md.
export {
  logbookContract,
  LogbookArchivedSchema,
  LogbookGoalSchema,
  LogbookProjectSchema,
  LogbookSchema,
  LogbookTaskSchema,
  LogbookWontDoSchema,
} from "./logbook.js";
// S9 (search + resources) fragment — additive exports of the slice's own
// schemas only; the router composition lines live in
// docs/plans/slices/s9-wiring.md.
export {
  searchContract,
  CommandIndexItemSchema,
  SearchMatchedFieldSchema,
  SearchResultKindSchema,
  SearchResultStateSchema,
  SearchSiteResultSchema,
} from "./search.js";
export type {
  CommandIndexItem,
  CommandIndexKind,
  SearchMatchedField,
  SearchResultKind,
  SearchResultState,
  SearchSiteResponse,
  SearchSiteResult,
  CommandIndexResponse,
} from "./search.js";
export { resourcesContract } from "./resources.js";
export { contractRouter } from "./router.js";
