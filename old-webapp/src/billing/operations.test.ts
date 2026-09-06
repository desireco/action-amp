import { describe, expect, it } from "vitest";
import { FOUNDER_MEMBERSHIP_WHERE } from "./config";

describe("Founding-100 membership count", () => {
  it("includes billed and manual Founders, never Friends", () => {
    expect(FOUNDER_MEMBERSHIP_WHERE).toEqual({
      OR: [
        { plan: "FOUNDER" },
        { manualAccessGrant: "FOUNDER" },
      ],
    });
  });
});
