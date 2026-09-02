// F4b — Prisma-shaped ROW types over the introspected Drizzle schema.
//
// The ported `operationsCore`s were typed against the Prisma client's model
// types (Task, Tag, TaskSession, …) and enums (Priority, Size, …). This module
// re-expresses them with `InferSelectModel` over `./schema` so the cores keep
// their exact structural shapes while losing the Prisma dependency.
//
// Timestamp parity: the schema's timestamp(3) / timestamptz(3) / date columns
// all run `mode: 'date'` (docs/plans/introspection-report.md §6 — the F4b
// decision), so every temporal field is a JS `Date`, exactly as Prisma mapped
// them (`@db.Date` arrives as UTC-midnight `Date`, like Prisma).
import type { InferSelectModel } from "drizzle-orm";
import {
  adminUserAction,
  adminUserActionType,
  analyticsEvent,
  analyticsEventName,
  analyticsSession,
  feedback,
  feedbackStatus,
  goal,
  inboxAttachment,
  inboxItem,
  inboxItemStatus,
  lens,
  listItem,
  loginEvent,
  magicLoginChallenge,
  manualAccessGrant,
  onboardingStage,
  payment,
  paymentStatus,
  plan,
  priority,
  project,
  projectAttachment,
  projectType,
  resource,
  resourceAttachment,
  size,
  tag,
  task,
  taskAttachment,
  taskSession,
  taskStatus,
  taskUpdate,
  taskUpdateKind,
  user,
} from "./schema/index.js";

// ---- Enums (the values Prisma generated as string-union types) ----

export type Priority = (typeof priority.enumValues)[number];
export type Size = (typeof size.enumValues)[number];
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type TaskUpdateKind = (typeof taskUpdateKind.enumValues)[number];
export type Plan = (typeof plan.enumValues)[number];
export type ManualAccessGrant = (typeof manualAccessGrant.enumValues)[number];
/** S13 — the onboarding state machine stage (`User.onboardingStage`). */
export type OnboardingStage = (typeof onboardingStage.enumValues)[number];
export type ProjectType = (typeof projectType.enumValues)[number];
export type InboxItemStatus = (typeof inboxItemStatus.enumValues)[number];
/** S16 — the payment audit trail's status (`Payment.status`). */
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
// S17 — the admin/feedback surface enums.
export type FeedbackStatus = (typeof feedbackStatus.enumValues)[number];
export type AnalyticsEventName = (typeof analyticsEventName.enumValues)[number];
export type AdminUserActionType = (typeof adminUserActionType.enumValues)[number];

// ---- Row types (Prisma model equivalents) ----

export type Task = InferSelectModel<typeof task>;
export type Tag = InferSelectModel<typeof tag>;
export type TaskSession = InferSelectModel<typeof taskSession>;
export type Lens = InferSelectModel<typeof lens>;
export type TaskUpdate = InferSelectModel<typeof taskUpdate>;
export type TaskAttachment = InferSelectModel<typeof taskAttachment>;
export type Project = InferSelectModel<typeof project>;
export type Goal = InferSelectModel<typeof goal>;
export type Resource = InferSelectModel<typeof resource>;
export type ListItem = InferSelectModel<typeof listItem>;
export type InboxItem = InferSelectModel<typeof inboxItem>;
export type InboxAttachment = InferSelectModel<typeof inboxAttachment>;
export type ProjectAttachment = InferSelectModel<typeof projectAttachment>;
export type ResourceAttachment = InferSelectModel<typeof resourceAttachment>;
export type User = InferSelectModel<typeof user>;
/** S16 — one recorded payment (the webhook's audit row / the Billing tab history). */
export type Payment = InferSelectModel<typeof payment>;
// S17 — the admin/feedback row types (Prisma model equivalents).
export type Feedback = InferSelectModel<typeof feedback>;
export type AnalyticsSession = InferSelectModel<typeof analyticsSession>;
export type AnalyticsEvent = InferSelectModel<typeof analyticsEvent>;
export type LoginEvent = InferSelectModel<typeof loginEvent>;
export type MagicLoginChallenge = InferSelectModel<typeof magicLoginChallenge>;
export type AdminUserAction = InferSelectModel<typeof adminUserAction>;
