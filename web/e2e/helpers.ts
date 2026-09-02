import type { Page } from "@playwright/test";

/**
 * Shared e2e helpers for the new stack (F11) — ported from
 * webapp/e2e/helpers.ts, re-authed for the Hono API.
 *
 * Auth convention (every future spec copies this — do NOT roll your own):
 *
 *   await loginAs(page, "someone@test.local");   // via the dev login route
 *   await page.goto("/");
 *
 * `loginAs` POSTs `/api/dev/login?email=…` through `page.request`, which
 * shares the browser context's cookie jar AND resolves the relative URL
 * against the web app's origin (:5174) — so the `wasp_session` cookie the
 * API stamps lands on the same origin the SPA talks to (the vite proxy
 * forwards /api + /rpc to :8080). One line and the SPA is "logged in".
 *
 * For wire-level assertions use `apiPost`: it sends the same context cookies
 * plus the `x-requested-with` CSRF header the API requires on cookie-authed
 * POSTs. (Note: the SPA's own RPC client does NOT send that header yet —
 * see the gap note in smoke.spec.ts.)
 */

/** The dev seed user — api/src/seed.ts SEED_DEV_EMAIL. */
export const DEV_EMAIL = "dev@local.test";

/**
 * The four sample rows api/src/seed.ts guarantees for DEV_EMAIL
 * (idempotent find-or-create; keep in sync when SAMPLE_TASKS changes).
 */
export const SEED_TASK_DESCRIPTIONS = [
  "Reply to Dana about the venue shortlist",
  "Draft the September signup announcement",
  "Book the dentist",
  "Read the deployment research doc",
] as const;

/** The Task DTO the contract returns (subset the specs care about). */
export interface TaskDto {
  id: string;
  description: string;
  status: "TODAY" | "UPCOMING" | "SOMEDAY" | "WONT_DO";
  priority: "IMPORTANT" | "NORMAL" | "LOW";
  isDone: boolean;
  order: number;
}

/**
 * Log the browser context in as `email` via the API's dev-only login route
 * (F10c). Minted session rows are real (Wasp-format) — the SPA sees a normal
 * session. Requires the API to run with NODE_ENV=development (global-setup
 * probes this and fails fast with the restart command).
 */
export async function loginAs(page: Page, email: string = DEV_EMAIL): Promise<void> {
  const res = await page.request.post(`/api/dev/login?email=${encodeURIComponent(email)}`);
  if (res.status() === 404) {
    throw new Error(
      "POST /api/dev/login answered 404 — the API is running without NODE_ENV=development. " +
        "Restart it with NODE_ENV=development (see e2e/global-setup.ts).",
    );
  }
  if (!res.ok()) {
    throw new Error(`Dev login failed for ${email}: HTTP ${res.status()} — ${await res.text()}`);
  }
}

/**
 * POST one oRPC procedure from the browser context — the same origin + cookie
 * jar the SPA uses, plus the `x-requested-with` header the API's CSRF guard
 * requires on cookie-authed mutations (every oRPC call is a POST on the wire,
 * reads included). Unwraps the `{"json": …}` envelope RPCLink speaks.
 */
export async function apiPost<T>(page: Page, path: string, input: unknown = undefined): Promise<T> {
  const res = await page.request.post(path, {
    headers: {
      "content-type": "application/json",
      "x-requested-with": "actionamp-e2e",
    },
    // RPCLink envelope: `{"json": <input>}` — undefined input serializes to {}
    // exactly like the client sends it.
    data: { json: input },
  });
  if (!res.ok()) {
    throw new Error(`RPC ${path} failed: HTTP ${res.status()} — ${await res.text()}`);
  }
  const body = (await res.json()) as { json?: T };
  return body.json as T;
}
