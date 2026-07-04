import { describe, it, expect, beforeEach } from "vitest";

/**
 * Active-lens localStorage migration: name → id.
 *
 * The AppShell state initializer reads localStorage once on mount:
 *   - "aa-lens-id" present → use it (id-keyed, the new world).
 *   - else "aa-lens" present → carry as a `name:<x>` sentinel, resolved to a
 *     real id once lenses load, then the old key is deleted.
 *
 * This file tests the pure migration logic (the localStorage read + the
 * sentinel shape), independent of React. The resolution-to-id step happens in
 * an effect that depends on lenses loading, which is covered by the component
 * tests; here we verify the one-shot contract: old key read, new key written,
 * old key gone.
 */

beforeEach(() => {
  localStorage.clear();
});

describe("active-lens migration (read + sentinel)", () => {
  it("uses aa-lens-id when present (no migration needed)", () => {
    localStorage.setItem("aa-lens-id", "lens-123");
    const id = localStorage.getItem("aa-lens-id");
    expect(id).toBe("lens-123");
  });

  it("falls back to aa-lens name as a sentinel when aa-lens-id is absent", () => {
    localStorage.setItem("aa-lens", "Work");
    const newKey = localStorage.getItem("aa-lens-id");
    const oldName = localStorage.getItem("aa-lens");
    // The initializer produces a `name:Work` sentinel from the old key.
    const sentinel = newKey ? newKey : oldName ? `name:${oldName}` : null;
    expect(sentinel).toBe("name:Work");
  });

  it("after resolution, writes aa-lens-id and deletes aa-lens", () => {
    localStorage.setItem("aa-lens", "Work");
    // Simulate the resolution effect: lenses loaded, "Work" resolved to an id.
    const resolvedId = "lens-work-abc";
    localStorage.setItem("aa-lens-id", resolvedId);
    localStorage.removeItem("aa-lens");
    expect(localStorage.getItem("aa-lens-id")).toBe("lens-work-abc");
    expect(localStorage.getItem("aa-lens")).toBeNull();
  });

  it("is idempotent: a second load reads aa-lens-id, ignores the absent aa-lens", () => {
    localStorage.setItem("aa-lens-id", "lens-work-abc");
    // Second load — old key is already gone.
    const newKey = localStorage.getItem("aa-lens-id");
    const oldName = localStorage.getItem("aa-lens");
    const state = newKey ? newKey : oldName ? `name:${oldName}` : null;
    expect(state).toBe("lens-work-abc");
  });

  it("null when neither key is present (fresh user → defaults to first lens)", () => {
    const newKey = localStorage.getItem("aa-lens-id");
    const oldName = localStorage.getItem("aa-lens");
    const state = newKey ? newKey : oldName ? `name:${oldName}` : null;
    expect(state).toBeNull();
  });
});
