import { describe, expect, test } from "bun:test";

import { DEFAULT_ORIGIN, FIELD_CAP, shareUrl } from "./capture.js";

describe("shareUrl (the toolbar-capture grammar)", () => {
  test("default origin is production", () => {
    expect(DEFAULT_ORIGIN).toBe("https://app.actionamp.com");
  });

  test("title + url, no selection → no text param", () => {
    const url = shareUrl({
      origin: "https://app.actionamp.com",
      title: "Cool page",
      url: "https://example.com/a",
      text: "",
    });
    expect(url).toBe("https://app.actionamp.com/share?title=Cool+page&url=https%3A%2F%2Fexample.com%2Fa");
    expect(url.includes("text=")).toBe(false);
  });

  test("selection rides as text; fields are URL-encoded", () => {
    const url = new URL(
      shareUrl({
        origin: "http://localhost:5174",
        title: "Doc & Notes",
        url: "https://example.com/x?y=1",
        text: "remember this",
      }),
    );
    expect(url.origin).toBe("http://localhost:5174");
    expect(url.pathname).toBe("/share");
    expect(url.searchParams.get("title")).toBe("Doc & Notes");
    expect(url.searchParams.get("url")).toBe("https://example.com/x?y=1");
    expect(url.searchParams.get("text")).toBe("remember this");
  });

  test("fields cap at the app's 2000-char field limit", () => {
    const url = new URL(
      shareUrl({
        origin: "https://app.actionamp.com",
        title: "t".repeat(3000),
        url: "https://example.com/",
        text: " ".repeat(50) + "s".repeat(3000),
      }),
    );
    expect(url.searchParams.get("title")).toHaveLength(FIELD_CAP);
    expect(url.searchParams.get("text")).toHaveLength(FIELD_CAP);
  });

  test("missing/blank pieces stay absent rather than empty", () => {
    const url = new URL(
      shareUrl({ origin: "https://app.actionamp.com", title: undefined, url: "", text: "  " }),
    );
    expect(url.searchParams.get("title")).toBe("");
    expect(url.searchParams.has("text")).toBe(false);
    expect(url.pathname).toBe("/share");
  });
});
