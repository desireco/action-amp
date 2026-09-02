// F4b — the SEAM CONTRACT: Prisma-shaped argument types + delegate interfaces.
//
// The ported `operationsCore`s speak Prisma's delegate dialect (`findMany({
// where, orderBy, include })`, `.update({ where, data, select })`, …). This
// module re-expresses that dialect without the Prisma client: filter/where/
// orderBy/data types covering exactly the shapes the ported cores pass (each
// is inventoried in docs/plans/tasks-port-inventory.md), plus the
// `Task`/`TaskSession`/`Lens` delegate interfaces `createEntities`
// (`./client.ts`) implements and F4c's Vitest mocks will fake.
//
// Fidelity notes (inherited from the original core slices, kept deliberately):
// - `undefined` means "leave untouched", `null` means "set NULL" — the Drizzle
//   implementation preserves both (Prisma semantics).
// - Where a core passed a `select` but its slice declared the full-row return
//   (e.g. `TaskSession.findFirst`), the seam keeps that widened return type;
//   the implementation still prunes the runtime payload to the select.
import type {
  Goal,
  InboxItem,
  InboxItemStatus,
  Lens,
  ListItem,
  ManualAccessGrant,
  OnboardingStage,
  Plan,
  Priority,
  Project,
  ProjectType,
  Size,
  Tag,
  Task,
  TaskSession,
  TaskStatus,
  TaskUpdateKind,
  User,
} from "./types.js";
// S12 — the push-subscription delegate's arg shapes (type-only; no cycle —
// the notifications cores import shared/time only).
import type {
  PushSubscriptionDeleteArgs,
  PushSubscriptionUpsertArgs,
} from "../notifications/operationsCore.js";

// ----------------------------------------------------------------
// Scalar filter primitives (the Prisma `XFilter` subset actually used)
// ----------------------------------------------------------------

export type SortOrder = "asc" | "desc";

export interface StringFilter {
  equals?: string;
  /** S9 — literal substring (Prisma `contains`; %/_ are escaped, not wildcards). */
  contains?: string;
  /** S9 — Prisma's `startsWith` probe (the search prefix pass). */
  startsWith?: string;
  in?: string[];
  not?: string | StringFilter;
  /** S9 — only "insensitive" appears in the ported reads. */
  mode?: "insensitive";
}

export interface StringNullableFilter {
  equals?: string | null;
  /** S9 — literal substring (Prisma `contains`). */
  contains?: string;
  /** S9 — Prisma's `startsWith` probe (the search prefix pass). */
  startsWith?: string;
  in?: string[];
  not?: string | StringNullableFilter | null;
  /** S9 — only "insensitive" appears in the ported reads. */
  mode?: "insensitive";
}

export interface BoolFilter {
  equals?: boolean;
  not?: boolean;
}

export interface EnumFilter<T extends string> {
  equals?: T;
  in?: T[];
  not?: T | EnumFilter<T>;
}

export interface EnumNullableFilter<T extends string> {
  equals?: T | null;
  in?: T[];
  not?: T | EnumNullableFilter<T> | null;
}

export interface DateTimeFilter {
  equals?: Date;
  in?: Date[];
  lt?: Date;
  lte?: Date;
  gt?: Date;
  gte?: Date;
  not?: Date | DateTimeFilter;
}

export interface DateTimeNullableFilter {
  equals?: Date | null;
  in?: Date[];
  lt?: Date | null;
  lte?: Date | null;
  gt?: Date | null;
  gte?: Date | null;
  not?: Date | DateTimeNullableFilter | null;
}

// ----------------------------------------------------------------
// Where inputs (Prisma `XWhereInput` for the three delegates in play)
// ----------------------------------------------------------------

export interface TaskWhereInput {
  id?: string | StringFilter;
  permalink?: string;
  userId?: string;
  lensId?: string | StringNullableFilter;
  projectId?: string | StringNullableFilter;
  goalId?: string | StringNullableFilter;
  description?: string | StringFilter;
  content?: string | StringNullableFilter;
  outcome?: string | StringNullableFilter;
  isDone?: boolean | BoolFilter;
  isOnboardingSample?: boolean | BoolFilter;
  priority?: Priority | EnumNullableFilter<Priority>;
  size?: Size | EnumNullableFilter<Size>;
  status?: TaskStatus | EnumNullableFilter<TaskStatus>;
  createdAt?: Date | DateTimeFilter;
  updatedAt?: Date | DateTimeFilter;
  completedAt?: Date | null | DateTimeNullableFilter;
  startedAt?: Date | null | DateTimeNullableFilter;
  scheduledDate?: Date | null | DateTimeNullableFilter;
  snoozedUntil?: Date | null | DateTimeNullableFilter;
  /** S9 — the search's nested task-note probe (`updates: { some: … }`). */
  updates?: TaskUpdateSomeFilter;
  AND?: TaskWhereInput[];
  OR?: TaskWhereInput[];
  NOT?: TaskWhereInput | TaskWhereInput[];
}

export interface TaskSessionWhereInput {
  id?: string;
  taskId?: string;
  userId?: string;
  completed?: boolean | BoolFilter;
  startedAt?: Date | DateTimeFilter;
  endedAt?: Date | null | DateTimeNullableFilter;
  AND?: TaskSessionWhereInput[];
  OR?: TaskSessionWhereInput[];
  NOT?: TaskSessionWhereInput | TaskSessionWhereInput[];
}

export interface LensWhereInput {
  id?: string;
  userId?: string;
  name?: string | StringFilter;
  color?: string | StringNullableFilter;
  purpose?: string | StringNullableFilter;
  isDefault?: boolean | BoolFilter;
  isIncluded?: boolean | BoolFilter;
  createdAt?: Date | DateTimeFilter;
  AND?: LensWhereInput[];
  OR?: LensWhereInput[];
  NOT?: LensWhereInput | LensWhereInput[];
}

/** User filters — the billing status count (`FOUNDER_MEMBERSHIP_WHERE`) plus
 *  the S13 onboarding core's by-PK reads. */
export interface UserWhereInput {
  id?: string;
  plan?: Plan | EnumFilter<Plan>;
  manualAccessGrant?: ManualAccessGrant | null | EnumNullableFilter<ManualAccessGrant>;
  AND?: UserWhereInput[];
  OR?: UserWhereInput[];
  NOT?: UserWhereInput | UserWhereInput[];
}

// ----------------------------------------------------------------
// S13/S15 — the User delegate: the onboarding core's writes (preferredName /
// hasSeenOnboarding / onboardingStage) and the billing status count
// (`FOUNDER_MEMBERSHIP_WHERE` — billed OR manual FOUNDER, never FRIEND).
// No full-row reads are inventoried; the acting user's own fields ride the
// auth context, not this delegate.
// ----------------------------------------------------------------

/** User patch — the three fields the onboarding cores write. */
export interface UserUpdateInput {
  preferredName?: string;
  hasSeenOnboarding?: boolean;
  onboardingStage?: OnboardingStage;
}

export interface UserFindUniqueArgs {
  where: { id: string };
  /** Guard-read select (the sample-task seed reads onboardingStage); the
   *  implementation returns the FULL row — the delegate-wide advisory-select
   *  precedent (Task findUnique). */
  select?: {
    onboardingStage?: true;
    hasSeenOnboarding?: true;
    preferredName?: true;
    firstName?: true;
  };
}

export interface UserUpdateArgs {
  where: { id: string };
  data: UserUpdateInput;
}

export interface UserCountArgs {
  where: UserWhereInput;
}

export interface UserDelegate {
  findUnique(args: UserFindUniqueArgs): Promise<User | null>;
  update(args: UserUpdateArgs): Promise<User>;
  count(args: UserCountArgs): Promise<number>;
}

// ----------------------------------------------------------------
// S12 — Web-Push subscriptions: the endpoint-keyed upsert (webapp
// notifications/operations.ts :: savePushSubscription) + the 404/410
// dead-endpoint prune (the daily-reminder job). Arg shapes live with the
// core that speaks them (@actionamp/domain/notifications).
// ----------------------------------------------------------------

export interface PushSubscriptionDelegate {
  upsert(args: PushSubscriptionUpsertArgs): Promise<unknown>;
  delete(args: PushSubscriptionDeleteArgs): Promise<unknown>;
}

/** S5 — Project filters: exactly the shapes the projects/goals cores pass. */
export interface ProjectWhereInput {
  id?: string | StringFilter;
  permalink?: string;
  userId?: string;
  lensId?: string;
  goalId?: string | StringNullableFilter;
  name?: string | StringFilter;
  isDone?: boolean | BoolFilter;
  archivedAt?: Date | null | DateTimeNullableFilter;
  type?: ProjectType | EnumFilter<ProjectType>;
  dueDate?: Date | null | DateTimeNullableFilter;
  /** S8 — the Logbook's done-projects read filters completedAt: { not: null }. */
  completedAt?: Date | null | DateTimeNullableFilter;
  /** S9 — the search's description probe (name + description AND-tokens). */
  description?: string | StringNullableFilter;
  AND?: ProjectWhereInput[];
  OR?: ProjectWhereInput[];
  NOT?: ProjectWhereInput | ProjectWhereInput[];
}

/** S6 — Goal filters: the goal cores only scope by user/lens/isDone and
 *  resolve id-or-permalink. S8 adds the completedAt filter (the Logbook's
 *  done-goals read). */
export interface GoalWhereInput {
  id?: string;
  permalink?: string;
  userId?: string;
  lensId?: string;
  name?: string | StringFilter;
  isDone?: boolean | BoolFilter;
  completedAt?: Date | null | DateTimeNullableFilter;
  /** S9 — the search's description probe (name + description AND-tokens). */
  description?: string | StringNullableFilter;
  AND?: GoalWhereInput[];
  OR?: GoalWhereInput[];
  NOT?: GoalWhereInput | GoalWhereInput[];
}

/**
 * S9 — resource filters, widened from S5's purge-only pair to the full read
 * surface the search core + resource CRUD cores pass: the contains probes
 * (title/notes/url) plus AND/OR composition and id/ownership scoping. The
 * original fields stay required-compatible (optional now — the S5 deleteMany
 * caller still passes both).
 */
export interface ResourceWhereInput {
  id?: string;
  projectId?: string;
  userId?: string;
  title?: string | StringFilter;
  notes?: string | StringNullableFilter;
  url?: string | StringNullableFilter;
  AND?: ResourceWhereInput[];
  OR?: ResourceWhereInput[];
  NOT?: ResourceWhereInput | ResourceWhereInput[];
}

/** S5 — the type-conversion guard counts a project's list items. */
export interface ListItemCountArgs {
  where: { projectId: string; isDone?: boolean };
}

// ----------------------------------------------------------------
// OrderBy inputs (Prisma `XOrderByWithRelationInput`, scalars only)
// ----------------------------------------------------------------

export interface TaskOrderBy {
  id?: SortOrder;
  permalink?: SortOrder;
  userId?: SortOrder;
  lensId?: SortOrder;
  projectId?: SortOrder;
  goalId?: SortOrder;
  description?: SortOrder;
  content?: SortOrder;
  outcome?: SortOrder;
  isDone?: SortOrder;
  isOnboardingSample?: SortOrder;
  priority?: SortOrder;
  size?: SortOrder;
  status?: SortOrder;
  order?: SortOrder;
  createdAt?: SortOrder;
  updatedAt?: SortOrder;
  completedAt?: SortOrder;
  startedAt?: SortOrder;
  scheduledDate?: SortOrder;
  snoozedUntil?: SortOrder;
}
export type TaskOrderByInput = TaskOrderBy | TaskOrderBy[];

export interface TaskSessionOrderBy {
  id?: SortOrder;
  taskId?: SortOrder;
  userId?: SortOrder;
  completed?: SortOrder;
  plannedMinutes?: SortOrder;
  startedAt?: SortOrder;
  endedAt?: SortOrder;
}
export type TaskSessionOrderByInput = TaskSessionOrderBy | TaskSessionOrderBy[];

export interface LensOrderBy {
  id?: SortOrder;
  userId?: SortOrder;
  name?: SortOrder;
  color?: SortOrder;
  purpose?: SortOrder;
  isDefault?: SortOrder;
  isIncluded?: SortOrder;
  createdAt?: SortOrder;
}
export type LensOrderByInput = LensOrderBy | LensOrderBy[];

export interface ProjectOrderBy {
  id?: SortOrder;
  permalink?: SortOrder;
  userId?: SortOrder;
  lensId?: SortOrder;
  goalId?: SortOrder;
  name?: SortOrder;
  isDone?: SortOrder;
  order?: SortOrder;
  type?: SortOrder;
  createdAt?: SortOrder;
  completedAt?: SortOrder;
  archivedAt?: SortOrder;
  dueDate?: SortOrder;
}
export type ProjectOrderByInput = ProjectOrderBy | ProjectOrderBy[];

export interface GoalOrderBy {
  id?: SortOrder;
  permalink?: SortOrder;
  userId?: SortOrder;
  lensId?: SortOrder;
  name?: SortOrder;
  isDone?: SortOrder;
  createdAt?: SortOrder;
  completedAt?: SortOrder;
}
export type GoalOrderByInput = GoalOrderBy | GoalOrderBy[];

// ----------------------------------------------------------------
// Write inputs (Prisma `XUpdateInput` / `XCreateInput` scalars)
// ----------------------------------------------------------------

/** Task patch — `undefined` leaves a field untouched, `null` clears it. */
export interface TaskUpdateInput {
  description?: string;
  content?: string | null;
  outcome?: string | null;
  isDone?: boolean;
  isOnboardingSample?: boolean;
  priority?: Priority;
  size?: Size;
  status?: TaskStatus;
  order?: number;
  permalink?: string;
  lensId?: string;
  projectId?: string | null;
  goalId?: string | null;
  completedAt?: Date | null;
  startedAt?: Date | null;
  scheduledDate?: Date | null;
  snoozedUntil?: Date | null;
}

export interface TaskSessionCreateInput {
  id?: string;
  taskId: string;
  userId: string;
  startedAt?: Date;
  endedAt?: Date | null;
  completed?: boolean;
  plannedMinutes?: number | null;
}

export interface TaskSessionUpdateInput {
  taskId?: string;
  userId?: string;
  startedAt?: Date;
  endedAt?: Date | null;
  completed?: boolean;
  plannedMinutes?: number | null;
}

/** Task create — the client-side defaults (uuid PK, enum/bool defaults) are
 *  supplied below the seam; the core passes the values it owns. */
export interface TaskCreateInput {
  description: string;
  permalink: string;
  content?: string | null;
  userId: string;
  lensId: string;
  projectId?: string | null;
  goalId?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  size?: Size;
  /** S13 — the onboarding sample-task seed's marker (surfaces in UI copy). */
  isOnboardingSample?: boolean;
  scheduledDate?: Date | null;
  snoozedUntil?: Date | null;
  /** S3 triage — resolved parsed tags connect inline (single atomic write). */
  tags?: { connect: { id: string }[] };
  /** S3 triage — captured images move with the item (nested create). */
  attachments?: NestedAttachmentsCreate;
}

export interface ProjectCreateInput {
  name: string;
  permalink: string;
  userId: string;
  lensId: string;
  goalId?: string | null;
  description?: string | null;
  order?: number;
  type?: ProjectType;
  /** S3 triage — captured images move with the item (nested create). */
  attachments?: NestedAttachmentsCreate;
}

export interface GoalCreateInput {
  name: string;
  permalink: string;
  userId: string;
  lensId: string;
  description?: string | null;
}

/**
 * S2+S3 — a prepared image attachment (bytes already decoded + validated by
 * the cores' `prepareImageAttachments`). Prisma's `Bytes` maps to Uint8Array;
 * the webapp cores pass Buffer (a Uint8Array subclass), so the structural
 * shape accepts both.
 */
export interface NewAttachmentRow {
  filename: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
}

/** Prisma's nested `attachments: { create: [...] }` write shape. */
export interface NestedAttachmentsCreate {
  create: NewAttachmentRow[];
}

/** S5's triage-disposition create (text + parsed tags) extended with every
 *  capture-time field the S2/S3 cores persist. */
export interface InboxItemCreateInput {
  text: string;
  title?: string | null;
  content?: string | null;
  sourceUrl?: string | null;
  status?: InboxItemStatus;
  archivedAt?: Date | null;
  userId: string;
  parsedTags?: string[];
  parsedScheduledDate?: Date | null;
  parsedSnoozedUntil?: Date | null;
  parsedPriority?: Priority | null;
  parsedSize?: Size | null;
  parsedProject?: string | null;
  parsedLens?: string | null;
  parsedProjectId?: string | null;
  parsedLensId?: string | null;
  attachments?: NestedAttachmentsCreate;
}

/** S3 — the text edit (updateInboxItem) + the archive status flip. */
export interface InboxItemUpdateInput {
  text?: string;
  status?: InboxItemStatus;
  archivedAt?: Date | null;
}

/** S3 — inbox reads/writes scope by owner + status; S9 adds the search's
 *  text probes (Android-share title, body, content, source link). */
export interface InboxItemWhereInput {
  id?: string;
  userId?: string;
  status?: InboxItemStatus | EnumFilter<InboxItemStatus>;
  text?: string | StringFilter;
  title?: string | StringNullableFilter;
  content?: string | StringNullableFilter;
  sourceUrl?: string | StringNullableFilter;
  AND?: InboxItemWhereInput[];
  OR?: InboxItemWhereInput[];
  NOT?: InboxItemWhereInput | InboxItemWhereInput[];
}

export interface InboxItemOrderBy {
  id?: SortOrder;
  createdAt?: SortOrder;
  status?: SortOrder;
  /** S8 — the Logbook's archived-notes read orders on archivedAt. */
  archivedAt?: SortOrder;
}
export type InboxItemOrderByInput = InboxItemOrderBy | InboxItemOrderBy[];

/** S3 — metadata rows the list + triage card render (bytes stay behind the
 *  attachment route). */
export interface InboxAttachmentMetaRow {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** S3 — a full row plus its attachment metadata (the triage findUnique). */
export interface InboxItemWithAttachments extends InboxItem {
  attachments: InboxAttachmentMetaRow[];
}

/** S3 — the getInboxItemsCore select: every scalar + attachment metadata. */
export interface InboxItemListSelect {
  id: true;
  text: true;
  title: true;
  content: true;
  sourceUrl: true;
  attachments: { select: { id: true; filename: true; mimeType: true } };
  createdAt: true;
  parsedScheduledDate: true;
  parsedSnoozedUntil: true;
  parsedPriority: true;
  parsedSize: true;
  parsedTags: true;
  parsedProject: true;
  parsedLens: true;
  parsedProjectId: true;
  parsedLensId: true;
}

/** The getInboxItemsCore row: base item + the projected attachment metadata. */
export interface InboxItemListRow extends InboxItem {
  attachments: Array<{ id: string; filename: string; mimeType: string }>;
}

/** S3 — the blobs a moving triage branch fetches lazily. */
export interface InboxAttachmentBlobRow {
  filename: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
}

export interface InboxItemFindUniqueArgs {
  where: { id: string };
  include?: {
    attachments: {
      select: { id: true; filename: true; mimeType: true; size: true };
    };
  };
}

export interface InboxItemFindManyArgs {
  where: InboxItemWhereInput;
  orderBy?: InboxItemOrderByInput;
  select?:
    | InboxItemListSelect
    | InboxItemLogbookSelect
    | InboxItemSearchSelect
    | InboxItemIndexSelect;
  /** S9 — the search passes request one sentinel row beyond the public cap. */
  take?: number;
}

export interface InboxItemCreateArgs {
  data: InboxItemCreateInput;
  select?: { id?: true; text?: true; createdAt?: true };
}

export interface InboxItemUpdateArgs {
  where: { id: string };
  data: InboxItemUpdateInput;
}

export interface InboxItemDeleteArgs {
  where: { id: string };
}

/** S3 — Resource create (the triage resource decision). */
export interface ResourceCreateInput {
  title: string;
  url?: string | null;
  notes?: string | null;
  userId: string;
  projectId: string;
  attachments?: NestedAttachmentsCreate;
}

export interface ResourceCreateArgs {
  data: ResourceCreateInput;
  /** S9 — the CRUD core projects the created row for the op payload. */
  select?: { id?: true; title?: true; url?: true; notes?: true; projectId?: true };
}

/** S3 — ListItem create/fetch (the triage list-item decision calls
 *  createListItemCore, which reads the list's last order and appends). */
export interface ListItemWhereInput {
  id?: string;
  userId?: string;
  projectId?: string;
  isDone?: boolean | BoolFilter;
}

export interface ListItemCreateInput {
  userId: string;
  projectId: string;
  text: string;
  content?: string | null;
  sourceUrl?: string | null;
  order?: number;
  attachments?: NestedAttachmentsCreate;
}

export interface ListItemFindFirstArgs {
  where: ListItemWhereInput;
  orderBy?: { order?: SortOrder };
  select?: { order?: true };
}

export interface ListItemCreateArgs {
  data: ListItemCreateInput;
}

/** S3 — resolveTagRecords upserts per-user tags (unique userId_name). */
export interface TagUpsertArgs {
  where: { userId_name: { userId: string; name: string } };
  create: { name: string; color: string; userId: string };
  update: Record<string, never>;
  select: { id: true };
}

export interface TagDelegate {
  upsert(args: TagUpsertArgs): Promise<{ id: string }>;
}

/** Project patch — `undefined` leaves a field untouched, `null` clears it. */
export interface ProjectUpdateInput {
  name?: string;
  description?: string | null;
  goalId?: string | null;
  dueDate?: Date | null;
  isDone?: boolean;
  completedAt?: Date | null;
  archivedAt?: Date | null;
  lensId?: string;
  order?: number;
  type?: ProjectType;
  permalink?: string;
}

export interface GoalUpdateInput {
  name?: string;
  description?: string | null;
  isDone?: boolean;
  completedAt?: Date | null;
}

/** Prisma's `{ count }` result for updateMany/deleteMany. */
export interface BatchPayload {
  count: number;
}

// ----------------------------------------------------------------
// Include shapes — the literal relation projections the cores pass
// ----------------------------------------------------------------

export interface ProjectRefInclude {
  select: { id: true; name: true };
}
export interface ProjectPermalinkInclude {
  select: { id: true; permalink: true; name: true };
}
export interface ProjectWithGoalInclude {
  select: {
    id: true;
    permalink: true;
    name: true;
    goal: { select: { id: true; name: true; description: true } };
  };
}
export interface GoalPermalinkInclude {
  select: { id: true; permalink: true; name: true; description: true };
}
export interface LensPillInclude {
  select: { id: true; name: true; color: true };
}
export interface AttachmentsInclude {
  select: { id: true; filename: true; mimeType: true };
}
export interface UpdatesChronoInclude {
  orderBy: { createdAt: SortOrder };
}
export interface NoteUpdatesInclude {
  where: { kind: TaskUpdateKind };
  orderBy: { createdAt: SortOrder };
  select: { body: true; createdAt: true };
}
export interface SessionsInclude {
  orderBy: { startedAt: SortOrder };
  select: { startedAt: true; endedAt: true };
}

// ---- Composite include families (one per read shape) ----

/** getTasksData — Today/Upcoming/Someday/Logbook list rows. */
export interface TaskListInclude {
  tags: true;
  project: ProjectRefInclude;
  goal: ProjectRefInclude;
}
/** getTodayTasksData / getWeekTasksData / getDoneTodayData — list rows + lens. */
export interface TaskLensListInclude extends TaskListInclude {
  lens: LensPillInclude;
}
/** fetchRankedActiveTasks (getTopTaskData / getTaskAlternativesData). */
export interface RankedPoolInclude {
  project: ProjectRefInclude;
  goal: ProjectRefInclude;
}
/** getTaskData — the task-detail lookup. */
export interface TaskDetailInclude {
  tags: true;
  updates: UpdatesChronoInclude;
  project: ProjectPermalinkInclude;
  goal: ProjectPermalinkInclude;
  attachments: AttachmentsInclude;
}
/** hydrateTopTaskData — the focus winner's Project→Goal + history payload. */
export interface TaskHydrateInclude {
  project: ProjectWithGoalInclude;
  goal: GoalPermalinkInclude;
  sessions: SessionsInclude;
  updates: NoteUpdatesInclude;
  attachments: AttachmentsInclude;
}

// ----------------------------------------------------------------
// Row shapes the includes produce (the cores' exported row types live here
// so delegate overloads and core slices share one definition)
// ----------------------------------------------------------------

/** A list row: base task + tags + the light project/goal refs list pages render. */
export interface TaskListRow extends Task {
  tags: Tag[];
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

/** A list row that also carries its lens (grouped/global views). */
export interface TaskLensListRow extends TaskListRow {
  lens: { id: string; name: string; color: string | null } | null;
}

/** A ranked-pool candidate: base task + the project/goal refs rankTopTask ties
 *  break on and the Next/Focus surfaces display. */
export interface RankedPoolRow extends Task {
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

/** A detail row: base task + permalink-carrying project/goal refs. */
export interface TaskDetailRow extends Task {
  project: { id: string; permalink: string; name: string } | null;
  goal: { id: string; permalink: string; name: string } | null;
  attachments: Array<{ id: string; filename: string; mimeType: string }>;
}

/** getTaskData's full payload: detail row + tags + the chronological updates. */
export type TaskDetailFullRow = TaskDetailRow & {
  tags: Tag[];
  updates: Array<{ id: string; body: string; kind: string; createdAt: Date }>;
};

/** A winner row hydrated with its Project→Goal chain, sessions, NOTEs —
 *  the include payload hydrateTopTaskData attaches. */
export interface HydratedTask extends Task {
  project: {
    id: string;
    permalink: string;
    name: string;
    goal: { id: string; name: string; description: string } | null;
  } | null;
  goal: {
    id: string;
    permalink: string;
    name: string;
    description: string;
  } | null;
  sessions: { startedAt: Date; endedAt: Date | null }[];
  updates: { body: string; createdAt: Date }[];
  attachments: { id: string; filename: string; mimeType: string }[];
}

// ----------------------------------------------------------------
// S5/S6 include shapes — the literal relation projections the projects and
// goals cores pass
// ----------------------------------------------------------------

/** getProjectsData — list rows + progress/nextAction feed + resource refs. */
export interface ProjectListInclude {
  goal: { select: { id: true; name: true } };
  tasks: {
    where: TaskWhereInput;
    select: {
      id: true;
      permalink: true;
      description: true;
      priority: true;
      size: true;
      status: true;
      isDone: true;
    };
    orderBy: Array<{ priority?: SortOrder } | { createdAt?: SortOrder }>;
    take: number;
  };
  resources: {
    orderBy: Array<{ createdAt: SortOrder }>;
    select: { id: true; title: true; url: true; notes: true; createdAt: true };
  };
  _count: {
    select: {
      tasks: { where: TaskWhereInput };
      listItems: { where: { isDone?: boolean } };
    };
  };
}

/** getProjectsData's second (done-totals) query. */
export interface ProjectTotalsSelect {
  id: true;
  _count: {
    select: {
      tasks: { where: TaskWhereInput };
      listItems: { where: { isDone?: boolean } };
    };
  };
}

/** getProjectData — the project-detail lookup. */
export interface ProjectDetailInclude {
  goal: { select: { id: true; permalink: true; name: true } };
  tasks: {
    orderBy: Array<
      { isDone?: SortOrder } | { priority?: SortOrder } | { createdAt?: SortOrder }
    >;
    select: {
      id: true;
      permalink: true;
      description: true;
      content: true;
      isDone: true;
      priority: true;
      size: true;
      status: true;
      scheduledDate: true;
      snoozedUntil: true;
      completedAt: true;
      attachments: { select: { id: true; filename: true; mimeType: true } };
    };
  };
  resources: {
    orderBy: Array<{ createdAt: SortOrder }>;
    select: {
      id: true;
      title: true;
      url: true;
      notes: true;
      createdAt: true;
      attachments: { select: { id: true; filename: true; mimeType: true } };
    };
  };
  attachments: { select: { id: true; filename: true; mimeType: true } };
}

/** getGoalsData — the active-goals list with the sequence-ordered projects. */
export interface GoalListInclude {
  projects: {
    orderBy: Array<{ order?: SortOrder } | { name?: SortOrder }>;
    select: { id: true; permalink: true; name: true; isDone: true; order: true };
  };
}

/** getGoalData — the goal-detail lookup (projects feed per-project progress). */
export interface GoalDetailInclude {
  projects: {
    orderBy: Array<{ order?: SortOrder } | { name?: SortOrder }>;
    select: {
      id: true;
      permalink: true;
      name: true;
      isDone: true;
      order: true;
      dueDate: true;
      tasks: { select: { id: true; isDone: true } };
    };
  };
}

// ----------------------------------------------------------------
// S5/S6 row shapes the includes produce
// ----------------------------------------------------------------

/** A projects-list row: base project + goal ref + the card's data feed. */
export interface ProjectListRow extends Project {
  goal: { id: string; name: string } | null;
  tasks: Array<{
    id: string;
    permalink: string;
    description: string;
    priority: Priority;
    size: Size;
    status: TaskStatus;
    isDone: boolean;
  }>;
  resources: Array<{
    id: string;
    title: string;
    url: string | null;
    notes: string | null;
    createdAt: Date;
  }>;
  _count: { tasks: number; listItems: number };
}

/** The done-totals row (second query of getProjectsData). */
export interface ProjectTotalsRow {
  id: string;
  _count: { tasks: number; listItems: number };
}

/** A detail row: base project + permalink-carrying goal + full task list. */
export interface ProjectDetailRow extends Project {
  goal: { id: string; permalink: string; name: string } | null;
  tasks: Array<{
    id: string;
    permalink: string;
    description: string;
    content: string | null;
    isDone: boolean;
    priority: Priority;
    size: Size;
    status: TaskStatus;
    scheduledDate: Date | null;
    snoozedUntil: Date | null;
    completedAt: Date | null;
    attachments: Array<{ id: string; filename: string; mimeType: string }>;
  }>;
  resources: Array<{
    id: string;
    title: string;
    url: string | null;
    notes: string | null;
    createdAt: Date;
    attachments: Array<{ id: string; filename: string; mimeType: string }>;
  }>;
  attachments: Array<{ id: string; filename: string; mimeType: string }>;
}

/** A goals-list row: base goal + the sequence-ordered linked projects. */
export interface GoalListRow extends Goal {
  projects: Array<{
    id: string;
    permalink: string;
    name: string;
    isDone: boolean;
    order: number;
  }>;
}

/** A goal-detail row: linked projects carry the per-project % feed. */
export interface GoalDetailRow extends Goal {
  projects: Array<{
    id: string;
    permalink: string;
    name: string;
    isDone: boolean;
    order: number;
    dueDate: Date | null;
    tasks: Array<{ id: string; isDone: boolean }>;
  }>;
}

// ----------------------------------------------------------------
// S8 — Logbook selects + rows: the five projected reads getLogbookData
// passes (done tasks, wont-do tasks, done projects, done goals, archived
// inbox items). Prisma prunes to the select; the seam returns exactly these
// shapes because they reach API payloads.
// ----------------------------------------------------------------

export interface TaskLogbookSelect {
  id: true;
  description: true;
  completedAt: true;
  size: true;
  outcome: true;
  project: { select: { id: true; name: true } };
}

export interface TaskWontDoSelect {
  id: true;
  description: true;
  updatedAt: true;
  size: true;
  project: { select: { id: true; name: true } };
}

export interface TaskLogbookRow {
  id: string;
  description: string;
  completedAt: Date | null;
  size: Size;
  outcome: string | null;
  project: { id: string; name: string } | null;
}

export interface TaskWontDoRow {
  id: string;
  description: string;
  updatedAt: Date | null;
  size: Size;
  project: { id: string; name: string } | null;
}

export interface ProjectLogbookSelect {
  id: true;
  name: true;
  completedAt: true;
  goal: { select: { id: true; name: true } };
}

export interface ProjectLogbookRow {
  id: string;
  name: string;
  completedAt: Date | null;
  goal: { id: string; name: string } | null;
}

export interface GoalLogbookSelect {
  id: true;
  name: true;
  completedAt: true;
}

export interface GoalLogbookRow {
  id: string;
  name: string;
  completedAt: Date | null;
}

export interface InboxItemLogbookSelect {
  id: true;
  text: true;
  archivedAt: true;
}

export interface InboxItemLogbookRow {
  id: string;
  text: string;
  archivedAt: Date | null;
}

// ----------------------------------------------------------------
// Delegate arg aliases (what the cores' `XEntities` slices reference)
// ----------------------------------------------------------------

export type TaskFindUniqueArgs = {
  where: { id: string; userId?: string };
  /** Guard-read selects (toggle/snooze/status/start/pause read ownership +
   *  done-state fields; S5's re-file guard reads lens/project refs). The
   *  implementation returns the FULL row — a superset by-PK fetch whose
   *  result stays internal to the cores, so the original slices' widened
   *  `Promise<Task | null>` stays truthful. */
  select?: {
    id?: true;
    isDone?: true;
    userId?: true;
    lensId?: true;
    projectId?: true;
    goalId?: true;
    isOnboardingSample?: true;
  };
};

export type TaskFindFirstArgs =
  | { where: TaskWhereInput; include: TaskDetailInclude }
  | { where: TaskWhereInput; include: TaskHydrateInclude }
  | { where: TaskWhereInput; select?: { id?: true } };

export type TaskFindManyArgs =
  | { where: TaskWhereInput; orderBy?: TaskOrderByInput; include: TaskListInclude }
  | {
      where: TaskWhereInput;
      orderBy?: TaskOrderByInput;
      include: TaskLensListInclude;
    }
  | { where: TaskWhereInput; include: RankedPoolInclude }
  | { where: TaskWhereInput; orderBy?: TaskOrderByInput; select?: TaskSelect }
  /** S9 — the search's three bounded passes (take: 11, projected relations). */
  | { where: TaskWhereInput; orderBy?: TaskOrderByInput; take: number; select: TaskSearchSelect }
  /** S9 — the compact palette-index read. */
  | { where: TaskWhereInput; orderBy?: TaskOrderByInput; select: TaskIndexSelect };

/** Guard-read select (S5 deleteProject's task fetch — the core reads only
 *  id/description/content; the widened full-row return stays truthful). */
export interface TaskSelect {
  id?: true;
  permalink?: true;
  description?: true;
  content?: true;
  isDone?: true;
  priority?: true;
  size?: true;
  status?: true;
  scheduledDate?: true;
  snoozedUntil?: true;
  completedAt?: true;
  startedAt?: true;
  userId?: true;
  lensId?: true;
  projectId?: true;
  goalId?: true;
  order?: true;
  createdAt?: true;
  updatedAt?: true;
}

export interface TaskCreateArgs {
  data: TaskCreateInput;
  select?: { id?: true; permalink?: true };
}

/** S3 — the triage task create's projected return ({ id } via select). */
export interface TaskCreateIdArgs {
  data: TaskCreateInput;
  select: { id: true };
}

export interface TaskDeleteManyArgs {
  where: TaskWhereInput;
}

export type TaskUpdateArgs =
  | { where: { id: string }; data: TaskUpdateInput }
  | {
      where: { id: string };
      data: TaskUpdateInput;
      select: { id: true; status: true; scheduledDate: true; snoozedUntil: true };
    }
  | { where: { id: string }; data: TaskUpdateInput; select: { id: true; startedAt: true } }
  | {
      where: { id: string };
      data: TaskUpdateInput;
      select: { id: true; projectId: true; goalId: true };
    };

export interface TaskUpdateManyArgs {
  where: TaskWhereInput;
  data: TaskUpdateInput;
}

export interface TaskCountArgs {
  where: TaskWhereInput;
}

export interface TaskSessionFindFirstArgs {
  where: TaskSessionWhereInput;
  orderBy?: TaskSessionOrderByInput;
  select?: {
    id?: true;
    taskId?: true;
    userId?: true;
    startedAt?: true;
    endedAt?: true;
    completed?: true;
    plannedMinutes?: true;
  };
}

export interface TaskSessionCreateArgs {
  data: TaskSessionCreateInput;
}

export interface TaskSessionUpdateArgs {
  where: { id: string };
  data: TaskSessionUpdateInput;
}

export interface TaskSessionUpdateManyArgs {
  where: TaskSessionWhereInput;
  data: TaskSessionUpdateInput;
}

export interface LensSelect {
  id?: true;
  userId?: true;
  name?: true;
  color?: true;
  purpose?: true;
  isDefault?: true;
  isIncluded?: true;
  createdAt?: true;
}

export interface LensFindFirstArgs {
  where: LensWhereInput;
  select?: LensSelect;
}

export interface LensFindManyArgs {
  where?: LensWhereInput;
  select?: LensSelect;
  orderBy?: LensOrderByInput;
}

// ----------------------------------------------------------------
// S7/S11 — the Settings Lenses tab's summary include (webapp
// getLensesCore/getLensCore): per-lens non-done `_count`s plus the relation
// probes `hasAnyContent`/`blockingProjects` read. Shapes match
// webapp/src/lenses/operationsCore.ts's include verbatim.
// ----------------------------------------------------------------

export interface LensSummaryInclude {
  _count: {
    select: {
      goals: { where: { isDone: false } };
      projects: { where: { isDone: false } };
      tasks: { where: { isDone: false } };
    };
  };
  goals: { select: { id: true }; take: 1 };
  projects: { select: { id: true; name: true }; orderBy: { createdAt: "asc" } };
  tasks: { select: { id: true }; take: 1 };
}

/** A Lens row hydrated with the summary include's relations. */
export interface LensSummaryRow extends Lens {
  _count: { goals: number; projects: number; tasks: number };
  goals: { id: string }[];
  projects: { id: string; name: string }[];
  tasks: { id: string }[];
}

export interface LensCountArgs {
  where: LensWhereInput;
}

/** The create/update projection — the webapp lens ops' select shape. */
export interface LensCreated {
  id: string;
  name: string;
  isDefault: boolean;
  isIncluded: boolean;
  color: string | null;
  purpose: string | null;
}

export interface LensCreateArgs {
  data: {
    name: string;
    isDefault: boolean;
    isIncluded: boolean;
    color: string | null;
    purpose: string | null;
    userId: string;
  };
  select: {
    id: true;
    name: true;
    isDefault: true;
    isIncluded: true;
    color: true;
    purpose: true;
  };
}

export interface LensUpdateArgs {
  where: { id: string };
  data: {
    name?: string;
    purpose?: string | null;
    color?: string | null;
  };
  select: {
    id: true;
    name: true;
    isDefault: true;
    isIncluded: true;
    color: true;
    purpose: true;
  };
}

export interface LensDeleteArgs {
  where: { id: string };
  select: { id: true };
}

// ----------------------------------------------------------------
// Delegates — one overload per inventoried query shape; the arg-type aliases
// above and these overloads must stay in lockstep (each overload pairs one
// where/include shape with the row type it returns).
// ----------------------------------------------------------------

export interface TaskDelegate {
  findUnique(args: TaskFindUniqueArgs): Promise<Task | null>;
  findFirst(args: {
    where: TaskWhereInput;
    include: TaskDetailInclude;
  }): Promise<TaskDetailFullRow | null>;
  findFirst(args: {
    where: TaskWhereInput;
    include: TaskHydrateInclude;
  }): Promise<HydratedTask | null>;
  findFirst(args: {
    where: TaskWhereInput;
    select?: { id?: true };
  }): Promise<Task | null>;
  findMany(args: {
    where: TaskWhereInput;
    orderBy?: TaskOrderByInput;
    include: TaskListInclude;
  }): Promise<TaskListRow[]>;
  findMany(args: {
    where: TaskWhereInput;
    orderBy?: TaskOrderByInput;
    include: TaskLensListInclude;
  }): Promise<TaskLensListRow[]>;
  findMany(args: {
    where: TaskWhereInput;
    include: RankedPoolInclude;
  }): Promise<RankedPoolRow[]>;
  // S8 — the Logbook's two projected task reads (done + wont-do). Placed
  // before the loose select overload so the relation-carrying selects resolve
  // to their exact row types.
  findMany(args: {
    where: TaskWhereInput;
    orderBy?: TaskOrderByInput;
    select: TaskLogbookSelect;
  }): Promise<TaskLogbookRow[]>;
  findMany(args: {
    where: TaskWhereInput;
    orderBy?: TaskOrderByInput;
    select: TaskWontDoSelect;
  }): Promise<TaskWontDoRow[]>;
  // S9 — the search's three bounded passes (take: 11, projected relations)
  // and the compact palette-index read. Relation-carrying selects resolve
  // before the loose select overload.
  findMany(args: {
    where: TaskWhereInput;
    orderBy?: TaskOrderByInput;
    take: number;
    select: TaskSearchSelect;
  }): Promise<TaskSearchRow[]>;
  findMany(args: {
    where: TaskWhereInput;
    orderBy?: TaskOrderByInput;
    select: TaskIndexSelect;
  }): Promise<TaskIndexRow[]>;
  findMany(args: {
    where: TaskWhereInput;
    select?: TaskSelect;
  }): Promise<Task[]>;
  update(args: { where: { id: string }; data: TaskUpdateInput }): Promise<Task>;
  update(args: {
    where: { id: string };
    data: TaskUpdateInput;
    select: { id: true; status: true; scheduledDate: true; snoozedUntil: true };
  }): Promise<{
    id: string;
    status: TaskStatus;
    scheduledDate: Date | null;
    snoozedUntil: Date | null;
  }>;
  update(args: {
    where: { id: string };
    data: TaskUpdateInput;
    select: { id: true; startedAt: true };
  }): Promise<{ id: string; startedAt: Date | null }>;
  update(args: {
    where: { id: string };
    data: TaskUpdateInput;
    select: { id: true; projectId: true; goalId: true };
  }): Promise<{ id: string; projectId: string | null; goalId: string | null }>;
  updateMany(args: TaskUpdateManyArgs): Promise<BatchPayload>;
  count(args: TaskCountArgs): Promise<number>;
  create(args: TaskCreateArgs): Promise<Task>;
  create(args: TaskCreateIdArgs): Promise<{ id: string }>;
  deleteMany(args: TaskDeleteManyArgs): Promise<BatchPayload>;
}

export interface TaskSessionDelegate {
  findFirst(args: TaskSessionFindFirstArgs): Promise<TaskSession | null>;
  create(args: TaskSessionCreateArgs): Promise<TaskSession>;
  update(args: TaskSessionUpdateArgs): Promise<TaskSession>;
  updateMany(args: TaskSessionUpdateManyArgs): Promise<BatchPayload>;
}

export interface LensDelegate {
  findFirst(args: LensFindFirstArgs): Promise<Lens | null>;
  // S7/S11 — the summary-include reads (Settings Lenses tab + the CLI's
  // lens list/show precedent). Placed before the loose overload so the
  // relation-carrying include resolves to its exact row type.
  findFirst(args: {
    where: LensWhereInput;
    include: LensSummaryInclude;
  }): Promise<LensSummaryRow | null>;
  findMany(args: LensFindManyArgs): Promise<Lens[]>;
  findMany(args: {
    where: LensWhereInput;
    orderBy?: LensOrderByInput;
    include: LensSummaryInclude;
  }): Promise<LensSummaryRow[]>;
  // S7/S11 — the Settings Lenses tab's CRUD writes (webapp lens ops).
  count(args: LensCountArgs): Promise<number>;
  create(args: LensCreateArgs): Promise<LensCreated>;
  update(args: LensUpdateArgs): Promise<LensCreated>;
  delete(args: LensDeleteArgs): Promise<{ id: string }>;
}

// ----------------------------------------------------------------
// S5/S6 delegates
// ----------------------------------------------------------------

/** Guard-read select: the scalar fields the project/goal cores check on
 *  findUnique/findFirst guard reads. Guard-reads return the FULL row (the
 *  select is advisory — a superset by filtered PK/relation fetch whose result
 *  stays internal to the cores, matching the Task delegate's precedent). */
export interface ProjectSelect {
  id?: true;
  name?: true;
  description?: true;
  dueDate?: true;
  isDone?: true;
  type?: true;
  order?: true;
  permalink?: true;
  createdAt?: true;
  completedAt?: true;
  archivedAt?: true;
  userId?: true;
  lensId?: true;
  goalId?: true;
}

export interface GoalSelect {
  id?: true;
  name?: true;
  description?: true;
  isDone?: true;
  permalink?: true;
  createdAt?: true;
  completedAt?: true;
  userId?: true;
  lensId?: true;
}

export interface ProjectFindFirstArgs {
  where: ProjectWhereInput;
  include?: ProjectDetailInclude;
  select?: ProjectSelect;
}

export interface ProjectFindUniqueArgs {
  where: { id: string; userId?: string };
  select?: ProjectSelect;
}

export interface ProjectFindManyArgs {
  where: ProjectWhereInput;
  orderBy?: ProjectOrderByInput;
  include?: ProjectListInclude;
  select?: ProjectTotalsSelect | ProjectSearchSelect | ProjectIndexSelect;
  /** S9 — the search passes request one sentinel row beyond the public cap. */
  take?: number;
}

export interface ProjectCreateArgs {
  data: ProjectCreateInput;
  select?: { id?: true; permalink?: true; name?: true };
}

export interface ProjectUpdateArgs {
  where: { id: string };
  data: ProjectUpdateInput;
  select?: ProjectSelect;
}

export interface ProjectCountArgs {
  where: ProjectWhereInput;
}

export interface ProjectDeleteArgs {
  where: { id: string };
  select?: { id?: true };
}

export interface ProjectDelegate {
  findUnique(args: ProjectFindUniqueArgs): Promise<Project | null>;
  findFirst(args: {
    where: ProjectWhereInput;
    include: ProjectDetailInclude;
  }): Promise<ProjectDetailRow | null>;
  findFirst(args: ProjectFindFirstArgs): Promise<Project | null>;
  findMany(args: {
    where: ProjectWhereInput;
    orderBy?: ProjectOrderByInput;
    include: ProjectListInclude;
  }): Promise<ProjectListRow[]>;
  // S8 — the Logbook's projected done-projects read (goal ref + completedAt).
  findMany(args: {
    where: ProjectWhereInput;
    orderBy?: ProjectOrderByInput;
    select: ProjectLogbookSelect;
  }): Promise<ProjectLogbookRow[]>;
  // S9 — the search's bounded passes + the compact palette-index read.
  findMany(args: {
    where: ProjectWhereInput;
    orderBy?: ProjectOrderByInput;
    take: number;
    select: ProjectSearchSelect;
  }): Promise<ProjectSearchRow[]>;
  findMany(args: {
    where: ProjectWhereInput;
    orderBy?: ProjectOrderByInput;
    select: ProjectIndexSelect;
  }): Promise<ProjectIndexRow[]>;
  findMany(args: {
    where: ProjectWhereInput;
    select: ProjectTotalsSelect;
  }): Promise<ProjectTotalsRow[]>;
  create(args: ProjectCreateArgs): Promise<Project>;
  update(args: ProjectUpdateArgs): Promise<Project>;
  updateMany(args: {
    where: ProjectWhereInput;
    data: ProjectUpdateInput;
  }): Promise<BatchPayload>;
  count(args: ProjectCountArgs): Promise<number>;
  delete(args: ProjectDeleteArgs): Promise<Project>;
}

export interface GoalFindFirstArgs {
  where: GoalWhereInput;
  include?: GoalDetailInclude;
  select?: GoalSelect;
}

export interface GoalFindUniqueArgs {
  where: { id: string; userId?: string };
  select?: GoalSelect;
}

export interface GoalFindManyArgs {
  where: GoalWhereInput;
  orderBy?: GoalOrderByInput;
  include?: GoalListInclude;
  /** S9 — the search/index reads (rows are the projected search shapes). */
  select?: GoalSearchSelect | GoalIndexSelect;
  take?: number;
}

export interface GoalCreateArgs {
  data: GoalCreateInput;
  select?: { id?: true; permalink?: true; name?: true };
}

export interface GoalUpdateArgs {
  where: { id: string };
  data: GoalUpdateInput;
  select?: GoalSelect;
}

export interface GoalCountArgs {
  where: GoalWhereInput;
}

export interface GoalDeleteArgs {
  where: { id: string };
  select?: { id?: true };
}

export interface GoalDelegate {
  findUnique(args: GoalFindUniqueArgs): Promise<Goal | null>;
  findFirst(args: {
    where: GoalWhereInput;
    include: GoalDetailInclude;
  }): Promise<GoalDetailRow | null>;
  findFirst(args: GoalFindFirstArgs): Promise<Goal | null>;
  findMany(args: {
    where: GoalWhereInput;
    orderBy?: GoalOrderByInput;
    include: GoalListInclude;
  }): Promise<GoalListRow[]>;
  // S8 — the Logbook's projected done-goals read.
  findMany(args: {
    where: GoalWhereInput;
    orderBy?: GoalOrderByInput;
    select: GoalLogbookSelect;
    take?: number;
  }): Promise<GoalLogbookRow[]>;
  // S9 — the search's bounded passes + the compact palette-index read.
  findMany(args: {
    where: GoalWhereInput;
    orderBy?: GoalOrderByInput;
    take: number;
    select: GoalSearchSelect;
  }): Promise<GoalSearchRow[]>;
  findMany(args: {
    where: GoalWhereInput;
    orderBy?: GoalOrderByInput;
    select: GoalIndexSelect;
  }): Promise<GoalIndexRow[]>;
  findMany(args: GoalFindManyArgs): Promise<Goal[]>;
  create(args: GoalCreateArgs): Promise<Goal>;
  update(args: GoalUpdateArgs): Promise<Goal>;
  count(args: GoalCountArgs): Promise<number>;
  delete(args: GoalDeleteArgs): Promise<Goal>;
}

/** S5 — deleteProject's triage disposition recreates each task as an inbox
 *  item; S2/S3 add the capture/list/triage surface (findUnique incl.
 *  attachment metadata, the UNPROCESSED list, update/updateMany/delete). */
export interface InboxItemDelegate {
  create(args: { data: InboxItemCreateInput }): Promise<InboxItem>;
  create(args: {
    data: InboxItemCreateInput;
    select: { id: true; text: true; createdAt: true };
  }): Promise<{ id: string; text: string; createdAt: Date }>;
  findUnique(args: InboxItemFindUniqueArgs): Promise<InboxItemWithAttachments | null>;
  findUnique(args: { where: { id: string } }): Promise<InboxItem | null>;
  // S8 — the Logbook's projected archived-notes read (no attachments).
  findMany(args: {
    where: InboxItemWhereInput;
    orderBy?: InboxItemOrderByInput;
    select: InboxItemLogbookSelect;
  }): Promise<InboxItemLogbookRow[]>;
  // S9 — the search's bounded passes + the compact palette-index read.
  findMany(args: {
    where: InboxItemWhereInput;
    orderBy?: InboxItemOrderByInput;
    take: number;
    select: InboxItemSearchSelect;
  }): Promise<InboxItemSearchRow[]>;
  findMany(args: {
    where: InboxItemWhereInput;
    orderBy?: InboxItemOrderByInput;
    select: InboxItemIndexSelect;
  }): Promise<InboxItemIndexRow[]>;
  findMany(args: InboxItemFindManyArgs): Promise<InboxItemListRow[]>;
  update(args: InboxItemUpdateArgs): Promise<InboxItem>;
  updateMany(args: {
    where: InboxItemWhereInput;
    data: InboxItemUpdateInput;
  }): Promise<BatchPayload>;
  delete(args: InboxItemDeleteArgs): Promise<InboxItem>;
}

/** S3 — lazy blob fetch for the triage branches that move attachments. */
export interface InboxAttachmentDelegate {
  findMany(args: {
    where: { inboxItemId: string };
    select: { filename: true; mimeType: true; size: true; data: true };
  }): Promise<InboxAttachmentBlobRow[]>;
}

/** S5 — resources are project-owned and leave with a deleted project; S3
 *  adds the triage resource create; S9 adds the project CRUD surface
 *  (ownership-scoped reads, patch update, delete). */
export interface ResourceDelegate {
  deleteMany(args: { where: ResourceWhereInput }): Promise<BatchPayload>;
  /** The row the create returns (superset of S3 triage's `{ id }` read). */
  create(args: ResourceCreateArgs): Promise<ResourceCreatedRow>;
  /** The CRUD cores' tenancy-scoped guard read (+ its project's lens). */
  findFirst(args: ResourceFindFirstArgs): Promise<ResourceWithLens | null>;
  findMany(args: {
    where: ResourceWhereInput;
    orderBy?: { createdAt?: SortOrder };
    take: number;
    select: ResourceSearchSelect;
  }): Promise<ResourceSearchRow[]>;
  findMany(args: {
    where: ResourceWhereInput;
    orderBy?: { createdAt?: SortOrder };
    select: ResourceIndexSelect;
  }): Promise<ResourceIndexRow[]>;
  update(args: ResourceUpdateArgs): Promise<ResourceUpdatedRow>;
  delete(args: ResourceDeleteArgs): Promise<{ id: string }>;
}

/** S5 — the SIMPLE_LIST type-conversion guard counts list items; S3 adds
 *  createListItemCore's append (last-order read + create). */
export interface ListItemDelegate {
  count(args: ListItemCountArgs): Promise<number>;
  findFirst(args: ListItemFindFirstArgs): Promise<ListItem | null>;
  create(args: ListItemCreateArgs): Promise<ListItem>;
}

// ----------------------------------------------------------------
// S9 — search + resource CRUD shapes: the projected reads the search core's
// three bounded passes per kind and the compact palette index make, plus the
// resource CRUD arg/row shapes. Prisma prunes to the select; the seam returns
// exactly these shapes because they reach API payloads.
// ----------------------------------------------------------------

/** The nested `updates: { some: … }` probe (task-note matches, tenancy-scoped). */
export interface TaskUpdateSomeFilter {
  some: {
    userId?: string;
    kind?: TaskUpdateKind;
    body?: string | StringFilter;
  };
}

/** Lens pill — `{ id, name, color }` (the search result lens chip). */
export interface SearchLensPill {
  id: string;
  name: string;
  color: string | null;
}

/** searchSiteData's task select (the projected row the rank loop reads). */
export interface TaskSearchSelect {
  id: true;
  description: true;
  permalink: true;
  content: true;
  outcome: true;
  isDone: true;
  status: true;
  createdAt: true;
  lens: { select: { id: true; name: true; color: true } };
  project: { select: { name: true } };
  updates: {
    where: {
      userId: string;
      kind: TaskUpdateKind;
      OR: Array<{ body: { contains: string; mode: "insensitive" } }>;
    };
    orderBy: { createdAt: SortOrder };
    take: number;
    select: { body: true };
  };
}

export interface TaskSearchRow {
  id: string;
  description: string;
  permalink: string;
  content: string | null;
  outcome: string | null;
  isDone: boolean;
  status: TaskStatus;
  createdAt: Date;
  lens: SearchLensPill | null;
  project: { name: string } | null;
  updates: Array<{ body: string }>;
}

/** getCommandPaletteIndexData's task select (title-only, no bodies). */
export interface TaskIndexSelect {
  id: true;
  description: true;
  permalink: true;
  status: true;
  isDone: true;
  project: { select: { name: true } };
  lens: { select: { name: true; color: true } };
}

export interface TaskIndexRow {
  id: string;
  description: string;
  permalink: string;
  status: TaskStatus;
  isDone: boolean;
  project: { name: string } | null;
  lens: { name: string; color: string | null };
}

export interface ProjectSearchSelect {
  id: true;
  name: true;
  permalink: true;
  description: true;
  isDone: true;
  createdAt: true;
  lens: { select: { id: true; name: true; color: true } };
  goal: { select: { name: true } };
}

export interface ProjectSearchRow {
  id: string;
  name: string;
  permalink: string;
  description: string | null;
  isDone: boolean;
  createdAt: Date;
  lens: SearchLensPill | null;
  goal: { name: string } | null;
}

export interface ProjectIndexSelect {
  id: true;
  name: true;
  permalink: true;
  isDone: true;
  lens: { select: { name: true; color: true } };
}

export interface ProjectIndexRow {
  id: string;
  name: string;
  permalink: string;
  isDone: boolean;
  lens: { name: string; color: string | null };
}

export interface GoalSearchSelect {
  id: true;
  name: true;
  permalink: true;
  description: true;
  isDone: true;
  createdAt: true;
  lens: { select: { id: true; name: true; color: true } };
}

export interface GoalSearchRow {
  id: string;
  name: string;
  permalink: string;
  description: string | null;
  isDone: boolean;
  createdAt: Date;
  lens: SearchLensPill | null;
}

export interface GoalIndexSelect {
  id: true;
  name: true;
  permalink: true;
  isDone: true;
  lens: { select: { name: true; color: true } };
}

export interface GoalIndexRow {
  id: string;
  name: string;
  permalink: string;
  isDone: boolean;
  lens: { name: string; color: string | null };
}

export interface ResourceSearchSelect {
  id: true;
  title: true;
  notes: true;
  url: true;
  createdAt: true;
  project: {
    select: {
      name: true;
      permalink: true;
      isDone: true;
      lens: { select: { id: true; name: true; color: true } };
    };
  };
}

export interface ResourceSearchRow {
  id: string;
  title: string;
  notes: string | null;
  url: string | null;
  createdAt: Date;
  project: {
    name: string;
    permalink: string;
    isDone: boolean;
    lens: SearchLensPill;
  };
}

export interface ResourceIndexSelect {
  id: true;
  title: true;
  project: {
    select: {
      name: true;
      permalink: true;
      lens: { select: { name: true; color: true } };
    };
  };
}

export interface ResourceIndexRow {
  id: string;
  title: string;
  project: {
    name: string;
    permalink: string;
    lens: { name: string; color: string | null };
  };
}

export interface InboxItemSearchSelect {
  id: true;
  text: true;
  title: true;
  content: true;
  sourceUrl: true;
  status: true;
  createdAt: true;
}

export interface InboxItemSearchRow {
  id: string;
  text: string;
  title: string | null;
  content: string | null;
  sourceUrl: string | null;
  status: InboxItemStatus;
  createdAt: Date;
}

export interface InboxItemIndexSelect {
  id: true;
  title: true;
  text: true;
  status: true;
  createdAt: true;
  archivedAt: true;
}

export interface InboxItemIndexRow {
  id: string;
  title: string | null;
  text: string;
  status: InboxItemStatus;
  createdAt: Date;
  archivedAt: Date | null;
}

// ---- S9 resource CRUD args + rows ----

/** createResourceCore's created-row projection (the op payload rides it). */
export interface ResourceCreatedRow {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  projectId: string;
}

/** getResourceData's guard read: the resource + its project's lens id. */
export interface ResourceFindFirstArgs {
  where: { id: string; userId: string };
  include?: { project: { select: { lensId: true } } };
}

export interface ResourceWithLens {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  url: string | null;
  notes: string | null;
  createdAt: Date;
  project: { lensId: string };
}

/** Resource patch — `undefined` leaves a field untouched, `null` clears it. */
export interface ResourceUpdateInput {
  title?: string;
  url?: string | null;
  notes?: string | null;
}

export interface ResourceUpdateArgs {
  where: { id: string };
  data: ResourceUpdateInput;
  select?: { id?: true; title?: true; url?: true; notes?: true; projectId?: true };
}

export interface ResourceUpdatedRow {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  projectId: string;
}

export interface ResourceDeleteArgs {
  where: { id: string };
}

/** The entities object a core receives: the Prisma-delegate slice, built over
 *  Drizzle by `createEntities` (`./client.ts`) or faked by F4c mocks. */
export interface Entities {
  Task: TaskDelegate;
  TaskSession: TaskSessionDelegate;
  Lens: LensDelegate;
  Project: ProjectDelegate;
  Goal: GoalDelegate;
  Tag: TagDelegate;
  InboxItem: InboxItemDelegate;
  InboxAttachment: InboxAttachmentDelegate;
  Resource: ResourceDelegate;
  ListItem: ListItemDelegate;
  /** S13/S15 — onboarding writes + the Founding-100 membership count. */
  User: UserDelegate;
  /** S12 — push subscriptions (save upsert + dead-endpoint prune). */
  PushSubscription: PushSubscriptionDelegate;
}
