/**
 * The S1+S4 DTO shapes — mirrors of the contract's zod schemas
 * (packages/contract/src/tasks.ts), hand-written so screens never import
 * `@actionamp/contract` directly (lib/api.ts is the only allowed importer;
 * the `client` it exports is already fully typed from the Router).
 *
 * Wire conventions: instants are ISO-8601 strings, calendar days
 * (`scheduledDate`) are `yyyy-MM-dd` strings.
 */

export type TaskStatus = "SOMEDAY" | "UPCOMING" | "TODAY" | "WONT_DO";
export type TaskPriority = "LOW" | "NORMAL" | "IMPORTANT";
export type TaskSize = "S" | "M" | "L" | "XL";
export type TaskUpdateKind = "NOTE" | "COMPLETED";
export type SnoozePreset = "1h" | "3h" | "tomorrow" | "weekend" | "someday";

export interface TaskFull {
  id: string;
  permalink: string;
  description: string;
  content: string | null;
  outcome: string | null;
  isDone: boolean;
  isOnboardingSample: boolean;
  priority: TaskPriority;
  size: TaskSize;
  status: TaskStatus;
  order: number;
  scheduledDate: string | null;
  snoozedUntil: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface GoalRefDto {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
}

/** The What Now winner (topTask): scalars + hydrated history. */
export interface WhatNowTask extends TaskFull {
  project: {
    id: string;
    permalink: string;
    name: string;
    goal: { id: string; name: string; description: string | null } | null;
  } | null;
  goal: GoalRefDto | null;
  sessions: { startedAt: string; endedAt: string | null }[];
  notes: { body: string; createdAt: string }[];
  attachments: { id: string; filename: string; mimeType: string }[];
}

export interface RankedTask extends TaskFull {
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

export interface TaskUpdateDto {
  id: string;
  body: string;
  kind: TaskUpdateKind;
  createdAt: string;
}

export interface FocusedTask extends Omit<WhatNowTask, "sessions"> {
  tags: { id: string; name: string }[];
  updates: TaskUpdateDto[];
  /** Focus sessions carry the countdown fields (plannedMinutes, completed). */
  sessions: {
    startedAt: string;
    endedAt: string | null;
    plannedMinutes: number | null;
    completed: boolean;
  }[];
  focusSessionMinutes: 25 | 45;
}

export interface TaskListRowDto extends TaskFull {
  tags: { id: string; name: string }[];
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

export interface TaskLensListRowDto extends TaskListRowDto {
  lens: { id: string; name: string; color: string | null } | null;
}

export interface AppData {
  lenses: {
    id: string;
    name: string;
    color: string | null;
    isIncluded: boolean;
    purpose: string | null;
  }[];
  counts: { today: number; upcoming: number; someday: number };
  todayCap: number;
  focusSessionMinutes: 25 | 45;
  timeZone: string;
}

export interface ListItemDto {
  id: string;
  text: string;
  content: string | null;
  sourceUrl: string | null;
  isDone: boolean;
  order: number;
  completedAt: string | null;
  createdAt: string;
  attachments: { id: string; filename: string; mimeType: string }[];
}

export interface ListProjectDto {
  id: string;
  permalink: string;
  name: string;
  type: "STANDARD" | "SIMPLE_LIST";
}
