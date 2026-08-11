import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin user operations", () => {
  const source = readFileSync(resolve(process.cwd(), "src/admin/operations.ts"), "utf8");

  it("places admin authorization before each user core call", () => {
    for (const operation of ["getAdminUsers", "grantAdminUserAccess", "removeAdminUserAccess", "deleteAdminUser"]) {
      const start = source.indexOf(`export const ${operation}`);
      const body = source.slice(start, source.indexOf("}) satisfies", start));
      expect(body.indexOf("requireAdmin(context)")).toBeGreaterThanOrEqual(0);
      expect(body.indexOf("requireAdmin(context)")).toBeLessThan(body.search(/Core\(|adminMutationEntities/));
    }
  });

  it("keeps argument validation in grant and delete wrappers", () => {
    expect(source).toContain('throw new HttpError(400, "Target user and grant are required.")');
    expect(source).toContain('throw new HttpError(400, "Target user and confirmation email are required.")');
  });
});
