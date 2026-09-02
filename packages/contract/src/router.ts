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
import { notificationsContract } from "./notifications.js"; // S12 (temporary gate wiring)
import { onboardingContract } from "./onboarding.js"; // S13 (temporary gate wiring)
import { publicContract } from "./public.js"; // S15 (temporary gate wiring)
import { billingContract } from "./billing.js"; // S16 (temporary gate wiring)
import { adminContract } from "./admin.js"; // S17 (temporary gate wiring)
import { feedbackContract } from "./feedback.js"; // S-review: feedback submit

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
  notifications: notificationsContract, // S12 (temporary gate wiring)
  onboarding: onboardingContract, // S13 (temporary gate wiring)
  public: publicContract, // S15 (temporary gate wiring)
  billing: billingContract, // S16 (temporary gate wiring)
  admin: adminContract, // S17 (temporary gate wiring)
  feedback: feedbackContract, // S-review: feedback submit
  // Next surfaces nest here, one line each (inbox, projects, goals, …):
};
