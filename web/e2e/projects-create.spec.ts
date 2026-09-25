import { test, expect } from "@playwright/test";
import { apiPost, loginAs, DEV_EMAIL, activeLensId } from "./helpers";

/**
 * The New-project composer's lens picker (#9): creating a project can assign
 * any lens, not just the silently-assumed active one. The seeded dev user is
 * PRO with two lenses, so the picker renders; the active lens is Work (the
 * first-created), so the interesting pick is the other one.
 */

test("the composer assigns the lens you pick, not just the active one", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);

  const lenses = await apiPost<{ id: string; name: string }[]>(
    page,
    "/rpc/inbox/lenses",
  );
  const activeId = await activeLensId(page);
  const target = lenses.find((l) => l.id !== activeId);
  expect(target, "the dev user needs a second lens to pick").toBeTruthy();

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();

  // The picker renders with the active lens preselected, the other unselected.
  const group = page.getByRole("radiogroup", { name: "Lens" });
  await expect(group).toBeVisible();
  const picked = group.getByRole("radio", { name: target!.name });
  await expect(picked).toHaveAttribute("aria-checked", "false");

  const projectName = `Lens pick ${Date.now().toString(36)}`;
  await page.getByRole("textbox", { name: "Project" }).fill(projectName);
  await picked.click();
  await expect(picked).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Create project" }).click();

  // The composer closes on success.
  await expect(page.getByRole("button", { name: "Create project" })).toBeHidden({
    timeout: 10_000,
  });

  // The project landed in the PICKED lens (the wire view).
  const inTarget = await apiPost<{ id: string; name: string }[]>(
    page,
    "/rpc/projects/list",
    { lensId: target!.id },
  );
  expect(inTarget.map((p) => p.name)).toContain(projectName);
});
