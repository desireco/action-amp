/**
 * The contract router — the single composition point for every surface.
 *
 * Per-surface contract fragments (tasks.ts, inbox.ts, …) export their own
 * namespace; this file nests them. Slices DELIVER a fragment file and leave
 * the composition line to the integrator — this file stays otherwise frozen
 * so parallel slice work never collides.
 *
 * Wire paths derive from the nesting: `tasks.list` → POST /rpc/tasks/list.
 */
import { tasksContract } from "./tasks.js";
import { projectsContract } from "./projects.js";
import { goalsContract } from "./goals.js";
import { inboxContract } from "./inbox.js";
import { logbookContract } from "./logbook.js";
import { lensesContract } from "./lenses.js";
import { prefsContract } from "./prefs.js";
import { searchContract } from "./search.js"; // S9 (temporary gate wiring)
import { resourcesContract } from "./resources.js"; // S9 (temporary gate wiring)

export const contractRouter = {
  tasks: tasksContract,
  projects: projectsContract,
  goals: goalsContract,
  inbox: inboxContract,
  logbook: logbookContract,
  lenses: lensesContract,
  prefs: prefsContract,
  search: searchContract, // S9 (temporary gate wiring)
  resources: resourcesContract, // S9 (temporary gate wiring)
  // Next surfaces nest here, one line each (inbox, projects, goals, …):
};
