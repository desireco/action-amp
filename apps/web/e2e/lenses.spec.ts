import { expect, test, type Page } from "@playwright/test";

import { loginAs } from "./helpers";

/**
 * Lenses spec — S7/S11 (no webapp e2e exists; the s11-settings README §6
 * checklist items 11–15 ARE the spec, plus the preferences tab's checks 6–8).
 *
 * Data: seeded by `apps/api/src/seed-lenses.ts` (run it before the suite):
 *   cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-lenses.ts
 *   s11-lenses@test.local  PRO — Me (included) + Work (indigo, "Day job",
 *                          1 goal / 1 project / 1 task) + Studio (empty, coral)
 *   s11-free@test.local    FREE — the same two defaults
 *
 * The Lenses tab is the surface under test (settings routes: Account,
 * Preferences, Lenses). Server errors surface verbatim inside the forms; the
 * server is the boundary (the client ProGate is the friendly layer).
 */

const PRO_EMAIL = "s11-lenses@test.local";
const FREE_EMAIL = "s11-free@test.local";
const RPC = "/rpc";

/** Unique-per-run suffix: created lenses never collide with leftovers from an
 *  interrupted run (the seed's RESET remains the pre-condition for the
 *  exact-list assertions in the first Pro test). */
const RUN = Date.now().toString(36).slice(-5);

/** POST one oRPC procedure without unwrapping — status + body assertions. */
async function rpc(page: Page, path: string, input: unknown = undefined) {
  return await page.request.post(`${RPC}${path}`, {
    headers: {
      "content-type": "application/json",
      "x-requested-with": "actionamp-e2e",
    },
    data: { json: input },
  });
}

interface LensRow {
  id: string;
  name: string;
  isDefault: boolean;
  isIncluded: boolean;
  color: string | null;
  purpose: string | null;
  hasAnyContent: boolean;
  counts: { goals: number; projects: number; tasks: number };
}

async function listLenses(page: Page): Promise<LensRow[]> {
  const res = await rpc(page, "/lenses/list");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { json: LensRow[] };
  return body.json;
}

test.describe("Lenses — Settings tab", () => {
  test("FREE: the tab renders the ProGate and config ops 402 (checklist 11)", async ({
    page,
  }) => {
    await loginAs(page, FREE_EMAIL);
    await page.goto("/do/settings/lenses");

    await expect(page.getByRole("alert")).toContainText("Custom lenses is a Pro feature.");
    // No list, no edits.
    await expect(page.getByText("+ New lens")).toHaveCount(0);

    // The server is the boundary: reads are allowed, configuration 402s.
    const create = await rpc(page, "/lenses/create", { name: "Sneaky" });
    expect(create.status()).toBe(402);
    // oRPC error envelope: { json: { code, message, data } }.
    const body = (await create.json()) as {
      json: { data: { feature: string; reason: string } };
    };
    expect(body.json.data.feature).toBe("Custom lenses");
    const update = await rpc(page, "/lenses/update", { id: "whatever", name: "X" });
    expect(update.status()).toBe(402);
    const remove = await rpc(page, "/lenses/delete", { id: "whatever", mode: "delete" });
    expect(remove.status()).toBe(402);
  });

  test("Pro: tabs + list order, non-done counts, and the account tab chrome (checklist 1, 12)", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/do/settings/lenses");

    // Settings chrome: back link "Next", h1, the five tabs.
    await expect(page.getByRole("link", { name: "Next" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Settings" });
    for (const tab of ["Account", "Billing", "Preferences", "Lenses", "Access tokens"]) {
      await expect(nav.getByRole("link", { name: tab })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Lenses" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Sort: included-first (Me), then seeded (Work), then createdAt (Studio).
    const rows = page.locator(".aa-lenses-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator(".aa-lenses-row__name")).toHaveText("Me");
    await expect(rows.nth(1).locator(".aa-lenses-row__name")).toHaveText("Work");
    await expect(rows.nth(2).locator(".aa-lenses-row__name")).toHaveText("Studio");

    // Counts are NON-done rows only: Work carries the seeded goal/project/task.
    await expect(rows.nth(1).getByText("1 goals")).toBeVisible();
    await expect(rows.nth(1).getByText("1 projects")).toBeVisible();
    await expect(rows.nth(1).getByText("1 tasks")).toBeVisible();
    await expect(rows.nth(2).getByText("0 tasks")).toBeVisible();

    // Color dot carries the lens color key.
    await expect(rows.nth(1)).toHaveAttribute("data-lens-color", "indigo");
    await expect(rows.nth(2)).toHaveAttribute("data-lens-color", "coral");
  });

  test("Pro: seeded lenses have no Delete control; the server refuses them (checklist 15)", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/do/settings/lenses");

    const rows = page.locator(".aa-lenses-row");
    await expect(rows).toHaveCount(3);

    // Open Me's edit form — no "Delete lens" (hidden for seeded lenses).
    await rows.nth(0).getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("button", { name: "Delete lens" })).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();

    // The server is the boundary even when the UI is bypassed.
    const lenses = await listLenses(page);
    const me = lenses.find((l) => l.name === "Me")!;
    const remove = await rpc(page, "/lenses/delete", { id: me.id, mode: "delete" });
    expect(remove.status()).toBe(409);
    const body = (await remove.json()) as { json: { message: string } };
    expect(body.json.message).toBe(
      `The "${me.name}" lens can't be deleted — it's one of your defaults.`,
    );
  });

  test("Pro: create, rename with 409 on duplicate, recolor (checklist 12)", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/do/settings/lenses");

    // Create — the form defaults to coral, name required.
    await page.getByRole("button", { name: "+ New lens" }).click();
    await expect(
      page.locator(".aa-lenses-edit").getByRole("button", { name: "Create lens" }),
    ).toBeDisabled();
    await page.getByPlaceholder("e.g. Studio, Board, Side project").fill(`Board ${RUN}`);
    await page.locator(".aa-lenses-edit").getByRole("button", { name: "Create lens" }).click();
    const rows = page.locator(".aa-lenses-row");
    await expect(rows).toHaveCount(4);
    await expect(rows.last().locator(".aa-lenses-row__name")).toHaveText(`Board ${RUN}`);

    // Rename to an existing name → the exact 409 string, inline in the form.
    await rows.last().getByRole("button", { name: "Edit" }).click();
    await page.locator(".aa-lenses-edit #lens-name").fill("Me");
    await page.locator(".aa-lenses-edit").getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".aa-lenses-error")).toHaveText(
      'You already have a lens named "Me".',
    );

    // The edit form stays open — rename to something free + recolor to honey.
    await page.locator(".aa-lenses-edit #lens-name").fill(`Planning ${RUN}`);
    await page.locator(".aa-lenses-swatch[data-lens-color='honey']").click();
    await page.locator(".aa-lenses-edit").getByRole("button", { name: "Save changes" }).click();
    await expect(rows).toHaveCount(4);
    await expect(rows.last().locator(".aa-lenses-row__name")).toHaveText(`Planning ${RUN}`);
    await expect(rows.last()).toHaveAttribute("data-lens-color", "honey");

    // Cleanup: hard-delete the now-empty lens.
    await rows.last().getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Delete lens" }).click();
    await expect(page.getByText("This lens is empty. Deleting it removes only the lens itself.")).toBeVisible();
    await page.getByRole("button", { name: `Delete Planning ${RUN}` }).click();
    await expect(rows).toHaveCount(3);
  });

  test("Pro: delete-with-content requires reassign; reassign moves content (checklist 14)", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);

    // A disposable lens carrying one project (wire-seeded — capture/create of
    // projects is S5's surface, not settings').
    const created = await rpc(page, "/lenses/create", { name: `Satellite ${RUN}`, color: "cyan" });
    expect(created.status()).toBe(200);
    const satelliteId = ((await created.json()) as { json: { id: string } }).json.id;
    const project = await rpc(page, "/projects/create", {
      name: `Satellite probe ${RUN}`,
      lensId: satelliteId,
    });
    expect(project.status()).toBe(200);

    await page.goto("/do/settings/lenses");
    const rows = page.locator(".aa-lenses-row");
    await expect(rows).toHaveCount(4);

    // Hard delete refuses content ("no silent cascade") even via the wire.
    const hard = await rpc(page, "/lenses/delete", { id: satelliteId, mode: "delete" });
    expect(hard.status()).toBe(409);
    expect(((await hard.json()) as { json: { message: string } }).json.message).toBe(
      "This lens still has content. Move it to another lens first, then delete.",
    );

    // The dialog defaults to reassign for a content-bearing lens.
    await rows.last().getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".aa-lenses-edit")).toContainText(`Satellite ${RUN}`);
    await page.getByRole("button", { name: "Delete lens" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("This lens has");
    await expect(dialog.getByRole("radio")).toBeChecked();
    await dialog.getByRole("combobox").selectOption({ label: "Me" });
    await page.getByRole("button", { name: `Delete Satellite ${RUN}` }).click();
    await expect(rows).toHaveCount(3);

    // The project moved with the reassign (Me gained it; Satellite is gone).
    // Read-after-write through the dev proxy can lag a beat — poll.
    await expect
      .poll(async () => {
        const lensRows = await listLenses(page);
        return lensRows.find((l) => l.name === "Me")!.counts.projects;
      })
      .toBeGreaterThanOrEqual(1);
    const lensRows = await listLenses(page);
    expect(lensRows.find((l) => l.name === `Satellite ${RUN}`)).toBeUndefined();
    const meId = lensRows.find((l) => l.name === "Me")!.id;
    const mine = await rpc(page, "/projects/list", { lensId: meId });
    const names = ((await mine.json()) as { json: { name: string }[] }).json.map((p) => p.name);
    expect(names).toContain(`Satellite probe ${RUN}`);

    // Cleanup: remove the moved probe (keeps re-runs without a re-seed honest).
    const created2 = ((await mine.json()) as { json: { id: string; name: string }[] }).json.find(
      (p) => p.name === `Satellite probe ${RUN}`,
    )!;
    await rpc(page, "/projects/delete", { id: created2.id });
  });

  test("Pro: reassign guards — foreign target 404s, same-id target 400s", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);

    // The seeded Work lens carries content; a reassign INTO it from a new lens
    // exercises the happy path's guards. (The goal-name collision 409 needs
    // two same-named goals, which the global Goal(userId, name) unique makes
    // unreachable through normal data — that rewrite is unit-covered in
    // packages/domain/src/lenses/lifecycleCore.test.ts.)
    const created = await rpc(page, "/lenses/create", { name: `Satellite ${RUN}` });
    const satelliteId = ((await created.json()) as { json: { id: string } }).json.id;
    await rpc(page, "/projects/create", { name: `Probe ${RUN}`, lensId: satelliteId });

    const workId = (await listLenses(page)).find((l) => l.name === "Work")!.id;

    // Same id as the source → 400 "Choose a different lens…".
    const self = await rpc(page, "/lenses/delete", {
      id: satelliteId,
      mode: "reassign",
      targetLensId: satelliteId,
    });
    expect(self.status()).toBe(400);

    // Foreign/unknown target → 404 "Target lens not found.".
    const ghost = await rpc(page, "/lenses/delete", {
      id: satelliteId,
      mode: "reassign",
      targetLensId: "00000000-0000-0000-0000-000000000000",
    });
    expect(ghost.status()).toBe(404);
    expect(((await ghost.json()) as { json: { message: string } }).json.message).toBe(
      "Target lens not found.",
    );

    // The happy path still lands on the seeded Work lens.
    const move = await rpc(page, "/lenses/delete", {
      id: satelliteId,
      mode: "reassign",
      targetLensId: workId,
    });
    expect(move.status()).toBe(200);
    await expect
      .poll(async () => {
        const rows = await listLenses(page);
        return rows.find((l) => l.id === workId)!.counts.projects;
      })
      .toBeGreaterThanOrEqual(2);

    // Cleanup: remove the moved probe (keeps re-runs without a re-seed honest).
    const workProjects = await rpc(page, "/projects/list", { lensId: workId });
    const probe = ((await workProjects.json()) as { json: { id: string; name: string }[] }).json.find(
      (p) => p.name === `Probe ${RUN}`,
    )!;
    await rpc(page, "/projects/delete", { id: probe.id });
  });

  test("Pro: create at the soft cap disables the button; a 9th lens 402s (checklist 13)", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/do/settings/lenses");

    // Top up to the cap of 8 (seed carries 3), remembering what we created.
    let lenses = await listLenses(page);
    const created: string[] = [];
    while (lenses.length < 8) {
      const res = await rpc(page, "/lenses/create", { name: `Cap filler ${RUN} ${lenses.length}` });
      expect(res.status()).toBe(200);
      created.push(((await res.json()) as { json: { id: string } }).json.id);
      lenses = await listLenses(page);
    }
    await page.reload();

    const add = page.getByRole("button", { name: "+ New lens" });
    await expect(add).toBeDisabled();
    await expect(add).toHaveAttribute("title", "Soft cap of 8 lenses reached");
    await expect(
      page.getByText("You've reached the soft cap of 8 lenses. Delete one to add another."),
    ).toBeVisible();

    // The server is the boundary: the 9th lens is refused with the exact copy.
    const ninth = await rpc(page, "/lenses/create", { name: `One too many ${RUN}` });
    expect(ninth.status()).toBe(402);
    const ninthBody = (await ninth.json()) as {
      json: { data: { feature: string; reason: string } };
    };
    expect(ninthBody.json.data.feature).toBe("a 9th lens");
    expect(ninthBody.json.data.reason).toBe("more life contexts unlock with Pro");

    // Cleanup so re-runs (and the other specs) start from the seeded three.
    for (const id of created) {
      const del = await rpc(page, "/lenses/delete", { id, mode: "delete" });
      expect(del.status()).toBe(200);
    }
  });
});

test.describe("Preferences — settings checks", () => {
  test("dark mode flips data-theme + localStorage immediately, no server call (checklist 6)", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/do/settings/preferences");

    const toggle = page.getByRole("switch", { name: "Dark mode" });
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const stored = await page.evaluate(() => localStorage.getItem("aa-theme"));
    expect(stored).toBe("dark");
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("today cap stepper: clamped, dirty-only Save, persists (checklist 8)", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);

    const value = page.getByRole("spinbutton", { name: "Today cap value" });
    // Wait for hydration: the page's own preferences load must have landed
    // before interacting (until then the stepper shows the fallback 5).
    const loaded = page.waitForResponse((r) =>
      r.url().includes("/rpc/prefs/getPreferences"),
    );
    await page.goto("/do/settings/preferences");
    const res0 = await loaded;
    const initial = ((await res0.json()) as { json: { todayCap: number } }).json.todayCap;
    await expect(value).toHaveValue(String(initial), { timeout: 10_000 });
    // Clean state: no Save button until the draft diverges.
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

    const serverCap = async () => {
      const r = await rpc(page, "/prefs/getPreferences");
      return ((await r.json()) as { json: { todayCap: number } }).json.todayCap;
    };

    // A stepper click COMMITS (webapp parity: −/+ call commitCap directly) —
    // on localhost the whole save round-trip beats one animation frame, so the
    // dirty Save button is only observable via the typed-input path below.
    await page.getByRole("button", { name: "Increase Today cap" }).click();
    await expect(value).toHaveValue(String(Math.min(12, initial + 1)));
    await expect.poll(serverCap, { timeout: 10_000 }).toBe(Math.min(12, initial + 1));

    // Typing diverges the draft WITHOUT committing → the dirty-only Save
    // button appears; clicking it persists (the webapp's Save path).
    const typed = Math.min(12, initial + 2);
    await value.fill(String(typed));
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect.poll(serverCap, { timeout: 10_000 }).toBe(typed);
    await expect(value).toHaveValue(String(typed));

    // Restore the seeded cap.
    await value.fill(String(initial));
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(serverCap, { timeout: 10_000 }).toBe(initial);
  });

  test("focus session radio commits immediately (checklist 7)", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/do/settings/preferences");

    const read = async () => {
      const r = await rpc(page, "/prefs/getPreferences");
      return ((await r.json()) as { json: { focusSessionMinutes: number } }).json
        .focusSessionMinutes;
    };
    const initial = await read();
    const next = initial === 25 ? 45 : 25;

    await page.getByRole("radio", { name: `${next} min` }).click();
    await expect.poll(read).toBe(next);

    // Restore.
    await page.getByRole("radio", { name: `${initial} min` }).click();
    await expect.poll(read).toBe(initial);
  });
});
