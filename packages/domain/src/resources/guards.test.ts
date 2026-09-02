import { describe, expect, it, vi } from "vitest";
import { assertResourceProject, resourceProjectLookup } from "./guards.js";
import type { GuardUser } from "../projects/guards.js";

// The op-layer guard webapp/src/resources/operations.ts ran before the core:
// ownership (404) and the SIMPLE_LIST structural rejection (400, byte-exact).
// The lens gate itself (assertLensAllowed) is already covered by the S5/S6
// billing suites — this pins placement + copy.

const user: GuardUser = { id: "user-1" };

describe("resource guards", () => {
  it("looks the project up ownership-scoped", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await resourceProjectLookup({ Project: { findFirst } }, user, "p1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "p1", userId: "user-1" },
      select: { id: true, lensId: true, type: true },
    });
  });

  it("admits a STANDARD project and rejects SIMPLE_LIST with the webapp copy", () => {
    expect(() =>
      assertResourceProject({ id: "p1", lensId: "l1", type: "STANDARD" }),
    ).not.toThrow();
    expect(() =>
      assertResourceProject({ id: "p1", lensId: "l1", type: "SIMPLE_LIST" }),
    ).toThrow("A Simple-list Project keeps only checklist items.");
    try {
      assertResourceProject({ id: "p1", lensId: "l1", type: "SIMPLE_LIST" });
    } catch (err) {
      expect(err).toMatchObject({
        statusCode: 400,
        message: "A Simple-list Project keeps only checklist items.",
      });
    }
  });

  it("rejects an unknown or foreign project with the 404", () => {
    try {
      assertResourceProject(null);
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 404, message: "Project not found." });
      return;
    }
    expect.unreachable("assertResourceProject(null) must throw.");
  });
});
