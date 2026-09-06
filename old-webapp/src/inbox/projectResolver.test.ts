import { describe, expect, it } from "vitest";
import { resolveProjectCandidate } from "./projectResolver";

const projects = [
  { id: "short", name: "Q4" },
  { id: "long", name: "Q4/OKR" },
  { id: "cpp", name: "C++" },
  { id: "mvp", name: "MVP" },
];

describe("resolveProjectCandidate", () => {
  it("uses an exact parsed-project match without guessing", () => {
    expect(resolveProjectCandidate(projects, { parsedProject: "mvp", text: "ship it" })?.id).toBe("mvp");
    expect(resolveProjectCandidate(projects, { parsedProject: "unknown", text: "ship MVP" })).toBeNull();
  });

  it("matches free-text project names with punctuation", () => {
    expect(resolveProjectCandidate(projects, { parsedProject: null, text: "review C++ plan" })?.id).toBe("cpp");
    expect(resolveProjectCandidate(projects, { parsedProject: null, text: "draft Q4/OKR notes" })?.id).toBe("long");
  });

  it("does not match inside longer words", () => {
    expect(resolveProjectCandidate(projects, { parsedProject: null, text: "ship MVP2" })).toBeNull();
  });

  it("chooses the longest free-text match", () => {
    expect(resolveProjectCandidate(projects, { parsedProject: null, text: "draft Q4 and Q4/OKR" })?.id).toBe("long");
  });
});
