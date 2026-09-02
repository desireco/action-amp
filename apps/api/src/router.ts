/**
 * The implemented oRPC router — apps/api's /rpc surface (mounted in index.ts).
 *
 * THIS IS THE ONE COMPOSITION POINT. Surface fragments live in
 * src/procedures/<surface>.ts; slices deliver a fragment file and leave the
 * composition line to the integrator, so parallel slice work never collides.
 * The contract side mirrors this: packages/contract/src/router.ts.
 *
 * Context: `{ db, entities, user }` — built per request in index.ts, which
 * runs the F10 session/PAT resolution before the oRPC handler.
 */
import { implement } from "@orpc/server";
import { contractRouter } from "@actionamp/contract";
import type { ApiContext } from "./context.js";
import { tasksProcedures } from "./procedures/tasks.js";
import { projectsProcedures } from "./procedures/projects.js";
import { goalsProcedures } from "./procedures/goals.js";
import { inboxProcedures } from "./procedures/inbox.js";
import { logbookProcedures } from "./procedures/logbook.js";
import { lensesProcedures } from "./procedures/lenses.js";
import { prefsProcedures } from "./procedures/prefs.js";
import { searchProcedures } from "./procedures/search.js"; // S9 (temporary gate wiring)
import { resourcesProcedures } from "./procedures/resources.js"; // S9 (temporary gate wiring)

export type { ApiContext } from "./context.js";
export { requireUser } from "./context.js";

// Typecheck the composition against the contract (paths + shapes).
const _typed = implement(contractRouter).$context<ApiContext>();
void _typed;

/** The mounted router — index.ts serves it at /rpc. */
export const router = {
  tasks: tasksProcedures,
  projects: projectsProcedures,
  goals: goalsProcedures,
  inbox: inboxProcedures,
  logbook: logbookProcedures,
  lenses: lensesProcedures,
  prefs: prefsProcedures,
  search: searchProcedures, // S9 (temporary gate wiring)
  resources: resourcesProcedures, // S9 (temporary gate wiring)
  // Next surfaces compose here, one line each (inbox, projects, goals, …):
};
