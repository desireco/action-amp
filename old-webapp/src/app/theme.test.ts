import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, preferredTheme, toggleTheme } from "./theme";

afterEach(() => {
  localStorage.removeItem("aa-theme");
  delete document.documentElement.dataset.theme;
});

describe("shared theme handlers", () => {
  it("applies, persists, resolves, and toggles one shared theme state", () => {
    expect(applyTheme("dark")).toBe("dark");
    expect(preferredTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggleTheme()).toBe("light");
    expect(localStorage.getItem("aa-theme")).toBe("light");
  });
});
