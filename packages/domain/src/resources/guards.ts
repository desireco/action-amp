// S9 — server-side entitlement/structural guards for the resource CRUD
// surface. Ported from webapp/src/resources/operations.ts's op-layer checks:
// the project must exist AND be owned (404), and a SIMPLE_LIST project takes
// list items only (400, byte-exact webapp wording — the web CLI route's near
// twin differs by "Simple list" wording, kept there). The lens gate itself is
// the shared `assertLensAllowed` (../projects/guards).
//
// Guard placement is parity-critical: ownership → SIMPLE_LIST → lens gate →
// core, so a FREE user probing a Work-lens project id learns nothing about
// simple-list structure (and vice versa).
import { HttpError, throwHttpStatus } from "../projects/httpError.js";
import { WORK_LENS_MESSAGE } from "../projects/guards.js";
import type { GuardUser } from "../projects/guards.js";

/** The project row the resource ops need (lens for the gate, type for the
 *  structural check). */
export interface ResourceProjectRef {
  id: string;
  lensId: string;
  type: "STANDARD" | "SIMPLE_LIST";
}

export function resourceProjectLookup(
  entities: {
    Project: {
      findFirst(args: {
        where: { id: string; userId: string };
        select?: { id?: true; lensId?: true; type?: true };
      }): Promise<ResourceProjectRef | null>;
    };
  },
  user: GuardUser | null,
  projectId: string,
): Promise<ResourceProjectRef | null> {
  return user
    ? entities.Project.findFirst({
        where: { id: projectId, userId: user.id },
        select: { id: true, lensId: true, type: true },
      })
    : Promise.resolve(null);
}

/** Guard the create path: 404 unknown/foreign project, 400 SIMPLE_LIST. */
export function assertResourceProject(
  project: ResourceProjectRef | null,
): asserts project is ResourceProjectRef {
  if (!project) throwHttpStatus(404, "Project not found.");
  if (project.type === "SIMPLE_LIST") {
    throw new HttpError(
      400,
      "A Simple-list Project keeps only checklist items.",
    );
  }
}

/** The default lens gate message for resource writes (the Work-lens rule). */
export { WORK_LENS_MESSAGE as RESOURCE_LENS_MESSAGE };
