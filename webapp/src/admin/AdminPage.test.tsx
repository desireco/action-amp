import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/admin/AdminPage.tsx"), "utf8");

describe("AdminPage device activity contract", () => {
  it("shows 7- and 30-day unique-user device evidence", () => {
    for (const text of ["Active users by device", "Mobile users", "Tablet users", "Desktop users", "in 30 days", "Unclassified"]) {
      expect(source).toContain(text);
    }
    for (const icon of ["PhoneIcon", "TabletIcon", "DesktopIcon", "emphasized"]) {
      expect(source).toContain(icon);
    }
  });
});
