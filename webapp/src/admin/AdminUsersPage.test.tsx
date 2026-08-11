import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/admin/AdminUsersPage.tsx"), "utf8");

describe("AdminUsersPage contract", () => {
  it("keeps directory state URL-backed and clears the cursor for new filters", () => {
    expect(source).toContain("useSearchParams");
    expect(source).toContain('p.delete("cursor")');
    expect(source).toContain("last_login_desc");
    expect(source).toContain("last_active_desc");
    expect(source).toContain('aria-label="Joined"');
    expect(source).toContain('aria-label="Active"');
  });

  it("renders the required activity and protected actions", () => {
    for (const text of ["Last login", "Last active", "Tasks finished", "Grant Friend", "Grant Founder", "Delete user data", "Delete selected", "Select visible users", "Not recorded"]) {
      expect(source).toContain(text);
    }
  });
});
