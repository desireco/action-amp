import { describe, expect, it } from "vitest";
import { detectMention } from "./detectMention";

// Pure-function tests for the `#`-mention trigger detector. The caret-anchored
// dropdown logic is hard to exercise in jsdom (no real layout), so this covers
// the trigger detection in isolation — the load-bearing "when does the dropdown
// open" decision.

describe("detectMention", () => {
  it("returns null when the caret is not in a #token", () => {
    expect(detectMention("just text", 5)).toBeNull();
    expect(detectMention("no sigil here", 14)).toBeNull();
  });

  it("returns null when caret is before any #", () => {
    expect(detectMention("text #mvp", 2)).toBeNull();
  });

  it("detects an open #token at the start of input", () => {
    // caret right after `#` — empty query
    expect(detectMention("#", 1)).toEqual({ at: 0, end: 1, query: "" });
    expect(detectMention("#m", 2)).toEqual({ at: 0, end: 2, query: "m" });
    expect(detectMention("#mvp", 4)).toEqual({ at: 0, end: 4, query: "mvp" });
  });

  it("detects a #token preceded by whitespace", () => {
    expect(detectMention("email #mvp", 10)).toEqual({ at: 6, end: 10, query: "mvp" });
    expect(detectMention("a #b", 4)).toEqual({ at: 2, end: 4, query: "b" });
  });

  it("detects mid-token — caret inside the chars after #", () => {
    // "#mvp" with caret between m and v → query "m"
    expect(detectMention("email #mvp", 8)).toEqual({ at: 6, end: 8, query: "m" });
  });

  it("closes the token on whitespace — caret after a space", () => {
    expect(detectMention("#mvp more", 5)).toBeNull(); // caret right after the space
    expect(detectMention("#mvp more", 6)).toBeNull();
  });

  it("closes the token at a newline", () => {
    expect(detectMention("#mvp\nmore", 5)).toBeNull();
  });

  it("treats a second # as a new token boundary (first # is project, second opens)", () => {
    // "#mvp #la" with caret at the end — second # opens a new mention at idx 5
    expect(detectMention("#mvp #la", 8)).toEqual({ at: 5, end: 8, query: "la" });
  });

  it("ignores # inside a word (e.g. C#) — not at a token boundary", () => {
    // The # is preceded by "C" (not whitespace), so it's not a mention trigger.
    expect(detectMention("writing C# code", 10)).toBeNull();
  });

  it("returns null for caretIndex < 1", () => {
    expect(detectMention("anything", 0)).toBeNull();
    expect(detectMention("x", -1)).toBeNull();
  });

  it("lowercases the query", () => {
    expect(detectMention("#MVP", 4)).toEqual({ at: 0, end: 4, query: "mvp" });
  });
});
