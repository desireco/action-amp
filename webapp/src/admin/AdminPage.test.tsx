import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/admin/AdminPage.tsx"), "utf8");

describe("AdminPage device activity contract", () => {
  it("shows 7- and 30-day unique-user device evidence", () => {
    for (const text of ["Active users by device", "Mobile", "Tablet", "Desktop", "Unclassified", "7 days", "30 days"]) {
      expect(source).toContain(text);
    }
  });
});
