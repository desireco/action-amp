import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 700, height: 760 } })).newPage();
await page.request.post("http://localhost:5174/api/dev/login?email=dev@local.test");
const name = "Review 12 " + Date.now().toString(36);
await page.goto("http://localhost:5174/projects");
await page.getByRole("button", { name: "New project" }).click();
await page.getByRole("textbox", { name: "Project" }).fill(name);
await page.getByRole("button", { name: "Create project" }).click();
await page.getByText(name).first().click({ timeout: 10_000 });
await page.getByRole("button", { name: /add task/i }).click({ timeout: 10_000 });
for (const t of ["Draft the outline", "Book the studio"]) {
  await page.getByPlaceholder(/what needs doing/i).fill(t);
  await page.getByRole("button", { name: /^create$/i }).click();
  await page.waitForTimeout(700);
}
// Complete the first task via its circle
const row1 = page.locator(".aa-project__row").filter({ hasText: "Draft the outline" });
await row1.getByRole("button", { name: "Mark complete" }).click();
await page.waitForTimeout(900);
// Expand the second row's editor
const row2 = page.locator(".aa-project__row").filter({ hasText: "Book the studio" });
await row2.locator(".aa-project__row-main").click();
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/review12.png", fullPage: false });
await browser.close();
console.log("review shot written");
