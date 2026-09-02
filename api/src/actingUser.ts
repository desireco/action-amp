/**
 * The acting-user union for /rpc handlers (F10). Both auth paths hydrate the
 * same essential shape: `id` (the User id) plus entitlement fields the
 * guards/billing read. Defined here (not in auth/) so session.ts and pat.ts
 * stay independent modules.
 */
import type { SessionUser } from "./auth/session.js";
import type { PatUser } from "./auth/pat.js";

export type ActingUser = SessionUser | PatUser;
