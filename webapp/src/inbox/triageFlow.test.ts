import { describe, expect, it } from "vitest";
import { buildDispatchPayload, canComplete, type Working } from "./triageFlow";

function working(type: Working["type"], title = "Milk"): Working {
  return {
    type,
    title,
    when: "Upcoming",
    size: "M",
    priority: "NORMAL",
    content: "",
    projectId: null,
    projectGoalId: null,
    due: "—",
    parentProjectId: null,
    kind: "Link",
  };
}

describe("Simple-list triage flow", () => {
  it("builds a minimal list-item payload", () => {
    expect(buildDispatchPayload(working("list-item", "  Oat milk  "), {
      inboxItemId: "ix-1",
      lensId: "shopping",
    })).toEqual({
      inboxItemId: "ix-1",
      decision: "list-item",
      lensId: "shopping",
      name: "Oat milk",
    });
  });

  it("requires a list destination and nonblank text without task metadata", () => {
    expect(canComplete(working("list-item"), "shopping", "list-1")).toBe(true);
    expect(canComplete(working("list-item"), "shopping", null)).toBe(false);
    expect(canComplete(working("list-item", "  "), "shopping", "list-1")).toBe(false);
    expect(canComplete(working("list-item"), null, null)).toBe(false);
  });
});
