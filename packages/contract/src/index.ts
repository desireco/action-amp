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
// S12 (push/PWA/share) fragment — additive export of the slice's own op only
// (saveDailyReminder/getNotificationPreferences already ship via prefs.ts);
// the router composition line lives in docs/plans/slices/s12-s14-wiring.md.
export { notificationsContract } from "./notifications.js";
// S10 (auth pages + issuance) fragment — additive exports of the slice's own
// ops only; the router composition line lives in
// docs/plans/slices/s10-wiring.md.
export { authContract } from "./auth.js";
// S13 (onboarding) + S15 (public/founding-100) fragments — additive exports
// of the slices' own schemas only; the router composition lines live in
// docs/plans/slices/s13-s15-wiring.md.
export {
  onboardingContract,
  CreatedLensSchema,
  OnboardingStageSchema,
  OnboardingStatusSchema,
  PreferredNameErrorMap,
} from "./onboarding.js";
export type {
  OnboardingStage,
  OnboardingStatus,
} from "./onboarding.js";
export {
  publicContract,
  Founding100StatusSchema,
} from "./public.js";
export type { Founding100Status } from "./public.js";
// S16 (billing) fragment — additive exports of the slice's own schemas only;
// the router composition line lives in docs/plans/slices/s16-wiring.md.
export {
  billingContract,
  BillingPaymentSchema,
  BillingStatusSchema,
  CheckoutPriceKeySchema,
} from "./billing.js";
export type { BillingStatus, CheckoutPriceKey } from "./billing.js";
// S17 (admin) fragment — additive exports of the slice's own schemas only;
// the router composition line lives in docs/plans/slices/s17-wiring.md §1.
export {
  adminContract,
  ActivityStatsSchema,
  ActivityWeekSchema,
  AdminFunnelStepSchema,
  AdminStatsSchema,
  AdminUserRowSchema,
  FEEDBACK_STATUSES,
  FeedbackRowSchema,
  FeedbackStatusSchema,
  FunnelStatsSchema,
  FunnelRangeSchema,
} from "./admin.js";
export type {
  ActivityStats,
  ActivityWeek,
  AdminStats,
  AdminUserRow,
  FeedbackRow,
  FeedbackStatus,
  FunnelRange,
  FunnelStats,
} from "./admin.js";
export { contractRouter } from "./router.js";
// S-review (feedback submit) fragment — additive export of the slice's own
// schemas only; the composition line lives in src/router.ts (both routers,
// marked `S-review: feedback submit`).
export {
  feedbackContract,
  FeedbackLensSchema,
  FeedbackSectionSchema,
  FeedbackSubmitErrorMap,
} from "./feedback.js";
export type {
  FeedbackLens,
  FeedbackSection,
} from "./feedback.js";
