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
  goal,
  lens,
  manualAccessGrant,
  plan,
  priority,
  project,
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

// ---- Row types (Prisma model equivalents) ----

export type Task = InferSelectModel<typeof task>;
export type Tag = InferSelectModel<typeof tag>;
export type TaskSession = InferSelectModel<typeof taskSession>;
export type Lens = InferSelectModel<typeof lens>;
export type TaskUpdate = InferSelectModel<typeof taskUpdate>;
export type TaskAttachment = InferSelectModel<typeof taskAttachment>;
export type Project = InferSelectModel<typeof project>;
export type Goal = InferSelectModel<typeof goal>;
export type User = InferSelectModel<typeof user>;
