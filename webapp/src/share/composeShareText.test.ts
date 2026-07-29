import { describe, it, expect } from "vitest";
import { composeShareText } from "./composeShareText";

describe("composeShareText", () => {
  it("returns empty when all fields absent", () => {
    expect(composeShareText({})).toBe("");
    expect(composeShareText({ title: "", text: "", url: "" })).toBe("");
    expect(composeShareText({ title: "   ", url: " " })).toBe("");
  });

  it("title + url → 'Title — url'", () => {
    expect(composeShareText({ title: "Cool Page", url: "https://x.com" }))
      .toBe("Cool Page — https://x.com");
  });

  it("title only → title", () => {
    expect(composeShareText({ title: "Just a title" })).toBe("Just a title");
  });

  it("url only → url", () => {
    expect(composeShareText({ url: "https://x.com" })).toBe("https://x.com");
  });

  it("text + url → 'text — url'", () => {
    expect(composeShareText({ text: "a note", url: "https://x.com" }))
      .toBe("a note — https://x.com");
  });

  it("text only → text", () => {
    expect(composeShareText({ text: "just text" })).toBe("just text");
  });

  it("title + text + url → 'title: text — url'", () => {
    expect(composeShareText({
      title: "Headline", text: "body", url: "https://x.com",
    })).toBe("Headline: body — https://x.com");
  });

  it("does not repeat a title Android has also included in text", () => {
    expect(composeShareText({
      title: "Supply | Single Edge Razors | One Blade. Solid Steel.",
      text: "Supply | Single Edge Razors | One Blade. Solid Steel. https://share.google/example",
    })).toBe("Supply | Single Edge Razors | One Blade. Solid Steel. — https://share.google/example");
  });

  it("truncates each field to 2000 chars with ellipsis", () => {
    const long = "a".repeat(2500);
    const out = composeShareText({ title: long, url: "https://x.com" });
    // title truncated to 2000 + "…", then " — https://x.com"
    expect(out).toBe("a".repeat(2000) + "… — https://x.com");
  });

  it("trims whitespace from each field before composing", () => {
    expect(composeShareText({ title: "  Cool  ", url: "  https://x.com  " }))
      .toBe("Cool — https://x.com");
  });
});
