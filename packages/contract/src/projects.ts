/**
 * The projects contract — S5 (surface slices: Projects list + detail).
 *
 * Shapes mirror webapp/src/projects/operationsCore.ts + operations.ts (the
 * parity checklist lives in s5-projects/README.md): list/create/get/update/
 * delete/move/setDone/archive, plus the detail page's add-task. Field names
 * match webapp/schema.prisma so the domain rows map 1:1.
 *
 * Wire conventions (same as tasks.ts): DTOs are the list/detail slices the
 * screens render; temporal fields cross the wire as ISO strings so the payload
 * stays JSON-simple. Errors the UI must special-case are DECLARED on the
 * procedure (`.errors`) so clients can branch on `err.code`:
 *
 * - `PAYMENT_REQUIRED` (402) — the FREE cap / Work-lens gate. `data` carries
 *   `{ feature, reason }` byte-exact from webapp (e.g. "a 4th project" /
 *   "organize more than 3 projects with Pro").
 * - `NOT_FOUND` (404) / `CONFLICT` (409 duplicate-name) / `BAD_REQUEST`
 *   (400 structural rejections, e.g. the same-Lens invariant) — messages are
 *   the webapp strings verbatim.
 *
 * `lensId` is optional on lens-scoped reads/creates: absent, the server
 * resolves the user's primary lens (the tasks.list precedent — the active-lens
 * picker is a later slice).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

/** `enum ProjectType` (webapp/schema.prisma). */
export const ProjectTypeSchema = z.enum(["STANDARD", "SIMPLE_LIST"]);

/** The 402 entitlement gate, declared so clients can catch it by code. */
export const ProGateErrorMap = {
  PAYMENT_REQUIRED: { status: 402, message: "Payment Required" },
} as const;

/** ISO date-time string on the wire (Date in the domain rows). */
const datetime = () => z.string();

/** A resource row as the list/detail payloads carry it (S9 renders these). */
export const ProjectResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: datetime(),
});

/**
 * List-row slice of the `Project` model (getProjectsData's output): progress
 * counts + the next-action preview the Projects cards render.
 */
export const ProjectSummarySchema = z.object({
  id: z.string(),
  permalink: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** `@db.Date` — ISO string at UTC midnight. */
  dueDate: datetime().nullable(),
  isDone: z.boolean(),
  type: ProjectTypeSchema,
  completedAt: datetime().nullable(),
  archivedAt: datetime().nullable(),
  goal: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** Open tasks (excludes WONT_DO) — momentum line + progress denominator. */
  openCount: z.number().int(),
  doneCount: z.number().int(),
  /** SIMPLE_LIST checklist counts (open/checked items). */
  openItems: z.number().int(),
  checkedItems: z.number().int(),
  nextAction: z
    .object({
      id: z.string(),
      permalink: z.string(),
      description: z.string(),
      priority: z.string(),
      size: z.string(),
      status: z.string(),
      isDone: z.boolean(),
    })
    .nullable(),
  resources: z.array(ProjectResourceSchema),
});

/** One task row inside the project detail payload (the horizon groups). */
export const ProjectDetailTaskSchema = z.object({
  id: z.string(),
  permalink: z.string(),
  description: z.string(),
  content: z.string().nullable(),
  isDone: z.boolean(),
  priority: z.string(),
  size: z.string(),
  status: z.string(),
  scheduledDate: datetime().nullable(),
  snoozedUntil: datetime().nullable(),
  completedAt: datetime().nullable(),
  attachments: z.array(z.object({ id: z.string(), filename: z.string(), mimeType: z.string() })),
});

/** Detail slice (getProjectData's output) — the work surface's whole payload. */
export const ProjectDetailSchema = z.object({
  id: z.string(),
  permalink: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  dueDate: datetime().nullable(),
  isDone: z.boolean(),
  type: ProjectTypeSchema,
  archivedAt: datetime().nullable(),
  /** Per-goal sequence position (goal-planning spec §E). */
  order: z.number().int(),
  /** The project's OWN lens — new tasks scope to this, not the active lens. */
  lensId: z.string(),
  goal: z.object({ id: z.string(), permalink: z.string(), name: z.string() }).nullable(),
  tasks: z.array(ProjectDetailTaskSchema),
  resources: z.array(ProjectResourceSchema),
  attachments: z.array(z.object({ id: z.string(), filename: z.string(), mimeType: z.string() })),
});

/**
 * The lens-scoped projects list. The page calls it with both includes on and
 * re-filters client-side into active/completed/archived (webapp parity).
 * 402 when a FREE user reads a non-included lens.
 */
export const listProjects = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      lensId: z.string().min(1).optional(),
      includeCompleted: z.boolean().optional(),
      includeArchived: z.boolean().optional(),
    }),
  )
  .output(z.array(ProjectSummarySchema));

/** Create a project → `{ id, permalink, name }`. 402 at the FREE cap. */
export const createProject = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      name: z.string(),
      lensId: z.string().min(1).optional(),
      goalId: z.string().optional(),
      description: z.string().optional(),
      type: ProjectTypeSchema.optional(),
    }),
  )
  .output(z.object({ id: z.string(), permalink: z.string(), name: z.string() }));

/**
 * One project by id OR permalink (the core matches either). Missing or
 * foreign → `null`; the page renders "This project doesn't exist — or isn't
 * yours." Detail reads are never lens-gated (no-data-loss invariant).
 */
export const getProject = oc
  .input(z.object({ id: z.string().min(1) }))
  .output(ProjectDetailSchema.nullable());

/** Add a task inside a project (the detail page's "Add task"). */
export const createProjectTask = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      description: z.string(),
      lensId: z.string().min(1).optional(),
      projectId: z.string().optional(),
      goalId: z.string().optional(),
    }),
  )
  .output(z.object({ id: z.string(), permalink: z.string() }));

/** Complete / reopen. Children untouched; idempotent. */
export const setProjectDone = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string(), isDone: z.boolean() }))
  .output(z.object({ id: z.string() }));

/** Archive (implies done). Idempotent. */
export const archiveProject = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }));

/** Move to another lens — tasks follow, the goal link severs. */
export const moveProject = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string(), targetLensId: z.string() }))
  .output(z.object({ id: z.string(), movedTaskCount: z.number().int() }));

/**
 * Edit: name / description / goal re-link / due date / type conversion.
 * `dueDate` is an ISO string (or null to clear). 409 on duplicate name is
 * parity-shaped (the unique constraint is permalink-only, so this is
 * effectively vestigial — kept byte-exact anyway).
 */
export const updateProject = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      goalId: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      type: ProjectTypeSchema.optional(),
    }),
  )
  .output(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      goalId: z.string().nullable(),
    }),
  );

/**
 * Delete with an explicit task disposition (webapp deleteProject): `delete`
 * (default, hard-deletes tasks), `reassign` (move to a sibling project —
 * requires `targetProjectId`), `triage` (each task becomes an InboxItem).
 * Resources always leave with the project.
 */
export const deleteProject = oc
  .input(
    z.object({
      id: z.string(),
      taskDisposition: z.enum(["delete", "reassign", "triage"]).optional(),
      targetProjectId: z.string().optional(),
    }),
  )
  .output(z.object({ id: z.string(), affectedTaskCount: z.number().int() }));

/** Re-file a task: project XOR goal (one-parent rule), same-lens invariant. */
export const updateProjectTask = oc
  .input(
    z.object({
      id: z.string(),
      projectId: z.string().nullable().optional(),
      goalId: z.string().nullable().optional(),
    }),
  )
  .output(
    z.object({
      id: z.string(),
      projectId: z.string().nullable(),
      goalId: z.string().nullable(),
    }),
  );

/**
 * Move-picker feed: the OTHER lenses a project could move to
 * (`{ id, name, color }`). Temporary stand-in for the lenses contract (S11) —
 * see s5-s6-wiring.md; retires when a lenses surface composes.
 */
export const projectMoveTargets = oc
  .input(z.object({ projectId: z.string() }))
  .output(z.array(z.object({ id: z.string(), name: z.string(), color: z.string().nullable() })));

/**
 * Horizon/status writes the project page drives (promote to Today, "Not
 * now", Start → focus). Temporary stand-in for the tasks-mutations namespace
 * (S4/S1) — the procedures call the already-ported domain cores; retires when
 * a tasks mutations surface composes (see s5-s6-wiring.md).
 */
export const setTaskStatus = oc
  .input(
    z.object({
      id: z.string(),
      status: z.enum(["TODAY", "UPCOMING", "SOMEDAY", "WONT_DO"]),
    }),
  )
  .output(z.object({ id: z.string() }));

export const startTask = oc
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), startedAt: z.string().nullable() }));

/** The projects namespace — paths: POST /rpc/projects/{list,create,…}. */
export const projectsContract = {
  list: listProjects,
  create: createProject,
  detail: getProject,
  createTask: createProjectTask,
  setDone: setProjectDone,
  archive: archiveProject,
  move: moveProject,
  update: updateProject,
  delete: deleteProject,
  updateTask: updateProjectTask,
  moveTargets: projectMoveTargets,
  setTaskStatus,
  startTask,
};
