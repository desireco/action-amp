import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { apiPost } from "./helpers";

/**
 * Onboarding e2e — S13 port of the fresh-user funnel (the P0 checklist:
 * packages/contract/src/s13-onboarding/README.md §1/§3/§7). webapp had no
 * dedicated spec (login/next covered the funnel edges); this one pins the
 * load-bearing switch-day behavior on the new stack:
 *
 *   signup-via-dev → welcome gate → complete → seeded Work/Me lenses +
 *   "General" project per lens exist, sample task created, stage advances;
 *   skip path ends COMPLETE with no sample task.
 *
 * Setup adaptations:
 * - "signup" = the dev login route (F10c) with a FRESH unique email — it
 *   creates the user dev-style, and devAutologin parity sets
 *   hasSeenOnboarding=true ("keep the gate quiet mid-test"). This spec then
 *   flips the flag back to false via psql to simulate the real signup state
 *   (the one field the dev seed can't leave false without breaking every
 *   OTHER suite that logs in).
 * - `firstName` is blanked the same way so the carousel's name step shows
 *   (dev-derived names would skip it).
 * - The name step's save failure-swallowing and the never-navigate-on-error
 *   rule are unit-pinned at the domain layer; here the happy paths are e2e.
 */

const DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://jake@localhost:5432/actionamp_dev";
const PSQL = process.env.E2E_PSQL ?? "psql";

interface OnboardingStatus {
  hasSeenOnboarding: boolean;
  onboardingStage: "SAMPLE_TASK" | "CAPTURE" | "TRIAGE" | "COMPLETE";
  firstName: string;
  preferredName: string | null;
}

interface LensRow {
  id: string;
  name: string;
  isDefault: boolean;
  isIncluded: boolean;
  color: string | null;
}

/** Flip a fresh dev user into the true just-signed-up state. */
function makeUnonboarded(userId: string): void {
  execFileSync(
    PSQL,
    [
      DB_URL,
      "-c",
      `UPDATE "User" SET "hasSeenOnboarding"=false, "firstName"='' WHERE id='${userId}'`,
    ],
    { encoding: "utf-8" },
  );
}

async function getStatus(page: Page): Promise<OnboardingStatus> {
  return await apiPost<OnboardingStatus>(page, "/rpc/onboarding/status");
}

async function getLenses(page: Page): Promise<LensRow[]> {
  return await apiPost<LensRow[]>(page, "/rpc/lenses/list");
}

/** Row counts via psql — direct, contract-free existence checks. */
function countRows(sql: string): number {
  const out = execFileSync(
    PSQL,
    [DB_URL, "-tA", "-c", sql],
    { encoding: "utf-8" },
  ).trim();
  return Number(out || "0");
}

test("fresh user: gate bounces the app home to /welcome, full flow completes and seeds", async ({
  page,
}) => {
  const email = `onboard-full-${Date.now()}@test.local`;
  const res = await page.request.post(`/api/dev/login?email=${encodeURIComponent(email)}`);
  expect(res.ok()).toBeTruthy();
  const { user } = (await res.json()) as { user: { id: string } };
  makeUnonboarded(user.id);

  // The gate: authed + hasSeenOnboarding=false on the app home → /welcome.
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText("It opens to one task, not a list.")).toBeVisible();

  // welcome → name (firstName was blanked)
  await page.getByRole("button", { name: "Show me →" }).click();
  await expect(page.getByText("What should we call you?")).toBeVisible();
  await page.getByLabel("Your name").fill("Ada");
  await page.getByRole("button", { name: "Looks good →" }).click();

  // capture → triage → focus
  await expect(page.getByText("Use ⌘K to capture a thought.")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Decide what each thing becomes.")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Start with one thing.")).toBeVisible();

  // finish → back to the app home (and it STICKS — no gate bounce-back)
  await page.getByRole("button", { name: "Try the practice task →" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(300);
  await expect(page).not.toHaveURL(/\/welcome/);

  // Server state: flag flipped, guidance started (SAMPLE_TASK stage).
  const status = await getStatus(page);
  expect(status.hasSeenOnboarding).toBe(true);
  expect(status.onboardingStage).toBe("SAMPLE_TASK");
  expect(status.preferredName).toBe("Ada");

  // Seeded defaults: Work (indigo, excluded) + Me (emerald, included) —
  // looked up/seeded by FLAGS, verified here with the identity colors.
  const lenses = await getLenses(page);
  const work = lenses.find((l) => l.name === "Work");
  const me = lenses.find((l) => l.name === "Me");
  expect(work).toMatchObject({ isDefault: true, isIncluded: false, color: "indigo" });
  expect(me).toMatchObject({ isDefault: true, isIncluded: true, color: "emerald" });

  // A "General" project per default lens (triage's P-key target).
  const general = countRows(
    `SELECT COUNT(*) FROM "Project" p JOIN "Lens" l ON l.id = p."lensId"
     WHERE p."userId"='${user.id}' AND p.name='General'
       AND l."isDefault"=true`,
  );
  expect(general).toBe(2);

  // The one sample task, in the Me lens, TODAY/NORMAL/S.
  const sample = countRows(
    `SELECT COUNT(*) FROM "Task" WHERE "userId"='${user.id}'
     AND description='Practice: complete this task' AND status='TODAY'
     AND priority='NORMAL' AND size='S' AND "isOnboardingSample"=true`,
  );
  expect(sample).toBe(1);
});

test("skip path: Esc-less skip ends COMPLETE with no sample task", async ({
  page,
}) => {
  const email = `onboard-skip-${Date.now()}@test.local`;
  const res = await page.request.post(`/api/dev/login?email=${encodeURIComponent(email)}`);
  expect(res.ok()).toBeTruthy();
  const { user } = (await res.json()) as { user: { id: string } };
  makeUnonboarded(user.id);

  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);

  // "Skip intro" = finish(true): returning-member path, guidance suppressed.
  await page.getByRole("button", { name: "Skip intro" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/\/welcome/);

  const status = await getStatus(page);
  expect(status.hasSeenOnboarding).toBe(true);
  // COMPLETE — which also prevents ensureOnboarded from seeding the task.
  expect(status.onboardingStage).toBe("COMPLETE");

  const sample = countRows(
    `SELECT COUNT(*) FROM "Task" WHERE "userId"='${user.id}'
     AND "isOnboardingSample"=true`,
  );
  expect(sample).toBe(0);

  // Lenses + General still seed (the bootstrap runs regardless of stage).
  const lenses = await getLenses(page);
  expect(lenses.find((l) => l.name === "Work")).toBeTruthy();
  expect(lenses.find((l) => l.name === "Me")).toBeTruthy();
});

test("gate is scoped: public pages stay reachable for an un-onboarded user", async ({
  page,
}) => {
  const email = `onboard-scope-${Date.now()}@test.local`;
  const res = await page.request.post(`/api/dev/login?email=${encodeURIComponent(email)}`);
  expect(res.ok()).toBeTruthy();
  const { user } = (await res.json()) as { user: { id: string } };
  makeUnonboarded(user.id);

  // /founding-100 is public — the gate must NOT yank an un-onboarded user off it.
  await page.goto("/founding-100");
  await expect(page).toHaveURL(/\/founding-100$/);
  await expect(page.getByText("Pro for the long run. One payment.")).toBeVisible();
  // The live status fetch answers; the spots copy renders.
  await expect(
    page.getByText(/public memberships (remaining|available)\./),
  ).toBeVisible();
  // The visitor is logged in (FREE) → the authed CTA branch (not the
  // anonymous login handoff, not the full/founder locked states).
  await expect(
    page.getByRole("button", { name: "Secure Your Lifetime Spot for $99" }),
  ).toBeVisible();
});
