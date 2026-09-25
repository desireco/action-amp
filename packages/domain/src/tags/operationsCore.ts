/**
 * Tag operations — the management half of the Tag model (#16, spec
 * `docs/specs/tag-management.md`). Tags are created at triage via `#token`
 * parsing (grammar v2.1; the spec's `@`-parsing note predates it) — this
 * module adds the second entrypoint: list, link, unlink, and the reserved
 * seed. Deliberately minimal per the spec: no rename/merge/delete/color ops
 * (an orphan Tag row is harmless), no tag-manager page.
 *
 * Reserved names feed focus-engine-v2's moment matcher; the seeder ensures
 * they exist per user without ever overwriting a same-named tag the user
 * already has (upsert with an empty update — the triage convention).
 */

import type { Entities, TagFindManyArgs, TagRow } from "../db/index.js";

/** The names the moment matcher ranks on — seeded once per user. */
export const RESERVED_TAG_NAMES = [
  "~15m",
  "~30m",
  "~1h",
  "~2h+",
  "low-energy",
  "med-energy",
  "high-energy",
] as const;

/** The create-time color triage uses — reserved tags stay consistent. */
const DEFAULT_TAG_COLOR = "teal";

/** The Tag delegates the tag cores call. The seam `Entities` satisfies this. */
export interface TagEntities {
  Tag: {
    findMany(args: TagFindManyArgs): Promise<TagRow[]>;
    upsert(args: {
      where: { userId_name: { userId: string; name: string } };
      create: { name: string; color: string; userId: string };
      update: Record<string, never>;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  Task: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    update(args: {
      where: { id: string };
      data: TaskUpdateInputTags;
    }): Promise<unknown>;
  };
}

/** The tag-edits slice of TaskUpdateInput (named so the mock seam can reuse it). */
export interface TaskUpdateInputTags {
  tags?: { connect?: { id: string }[]; disconnect?: { id: string }[] };
}

/** Triage's normalization: strip leading `#`/`@` (repeated), lowercase. */
export function normalizeTagName(raw: string): string {
  return raw
    .trim()
    .replace(/^[#@]+/, "")
    .toLowerCase();
}

/** The user's tags (id/name/color), name-ordered — the typeahead source. */
export async function listTagsCore(
  entities: TagEntities,
  { userId }: { userId: string },
): Promise<TagRow[]> {
  return await entities.Tag.findMany({
    where: { userId },
    select: { id: true, name: true, color: true },
  });
}

/**
 * Resolve-or-create the tag by name, then connect it to the task.
 * Idempotent twice over: the upsert on `@@unique([userId, name])` and the
 * connect (`onConflictDoNothing` on the join row). Tenancy-safe — the task
 * must belong to the caller.
 */
export async function linkTaskTagCore(
  entities: TagEntities,
  { userId, taskId, name }: { userId: string; taskId: string; name: string },
): Promise<{ taskId: string; tagId: string; name: string }> {
  const clean = normalizeTagName(name);
  if (!clean) throw new Error("Tag name is required.");
  const task = await entities.Task.findFirst({
    where: { id: taskId, userId },
    select: { id: true },
  });
  if (!task) throw new Error("Task not found.");
  const tag = await entities.Tag.upsert({
    where: { userId_name: { userId, name: clean } },
    create: { name: clean, color: DEFAULT_TAG_COLOR, userId },
    update: {},
    select: { id: true },
  });
  await entities.Task.update({
    where: { id: taskId },
    data: { tags: { connect: [{ id: tag.id }] } },
  });
  return { taskId, tagId: tag.id, name: clean };
}

/**
 * Disconnect the tag from the task. The Tag row itself is never deleted —
 * other tasks may use it (spec decision). Tenancy-safe on the task.
 */
export async function unlinkTaskTagCore(
  entities: TagEntities,
  { userId, taskId, tagId }: { userId: string; taskId: string; tagId: string },
): Promise<{ taskId: string; tagId: string }> {
  const task = await entities.Task.findFirst({
    where: { id: taskId, userId },
    select: { id: true },
  });
  if (!task) throw new Error("Task not found.");
  await entities.Task.update({
    where: { id: taskId },
    data: { tags: { disconnect: [{ id: tagId }] } },
  });
  return { taskId, tagId };
}

/**
 * The reserved-name seed — idempotent per user (upsert, empty update), so a
 * same-named tag the user created themselves keeps its color and the rerun
 * is a no-op. Called from `ensureOnboardedCore`, which runs on app load.
 */
export async function seedReservedTagsCore(
  entities: TagEntities,
  { userId }: { userId: string },
): Promise<void> {
  for (const name of RESERVED_TAG_NAMES) {
    await entities.Tag.upsert({
      where: { userId_name: { userId, name } },
      create: { name, color: DEFAULT_TAG_COLOR, userId },
      update: {},
      select: { id: true },
    });
  }
}

// The seam-wide Entities satisfies every core here (checked by seam.checks).
export type TagCoresEntities = Entities;
