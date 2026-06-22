import { describe, expect, it } from "vitest";
import { parseCapture } from "./parseCapture";

// Table-driven parser tests. parseCapture is a pure function — the highest-
// leverage test target in the codebase (every capture + every chip preview
// runs through it). Covers: tags, priority, size, dates, clean-text collapse.

describe("parseCapture", () => {
  // Fixed "now" so relative date tests are deterministic: Wed 2026-06-24 10:00
  const NOW = new Date(2026, 5, 24, 10, 0, 0); // June = month index 5

  describe("tags (# and @)", () => {
    it.each([
      ["email #work", ["#work"], "email"],
      ["call @phone", ["@phone"], "call"],
      ["buy milk #errands @home", ["#errands", "@home"], "buy milk"],
      // Tags-only input falls back to raw text (parser avoids empty captures).
      ["#tag-1 @tag_2", ["#tag-1", "@tag_2"], "#tag-1 @tag_2"],
    ])("'%s' → tags %j, text %j", (input, tags, text) => {
      const r = parseCapture(input, NOW);
      expect(r.parsedTags).toEqual(tags);
      expect(r.cleanText).toBe(text);
    });

    it("lowercases tag names", () => {
      expect(parseCapture("Email #WORK", NOW).parsedTags).toEqual(["#work"]);
    });
  });

  describe("priority", () => {
    it.each([
      ["task !1", "LOW"],
      ["task !low", "LOW"],
      ["task !", "LOW"],
      ["task !2", "NORMAL"],
      ["task !normal", "NORMAL"],
      ["task !!", "NORMAL"],
      ["task !3", "IMPORTANT"],
      ["task !important", "IMPORTANT"],
      ["task !imp", "IMPORTANT"],
      ["task !!!", "IMPORTANT"],
    ])("'%s' → %s", (input, priority) => {
      const r = parseCapture(input, NOW);
      expect(r.parsedPriority).toBe(priority);
      expect(r.cleanText).toBe("task");
    });

    it("defaults to null when no priority token", () => {
      expect(parseCapture("just text", NOW).parsedPriority).toBeNull();
    });
  });

  describe("size — time tokens", () => {
    it.each([
      ["~10m", "S"], // <15m
      ["~14m", "S"],
      ["~15m", "M"], // >=15m, <1h
      ["~45m", "M"],
      ["~1h", "L"], // >=1h, <2h (60m)
      ["~1.5h", "L"],
      ["~2h", "XL"], // >=2h (120m)
      ["~3h", "XL"],
    ])("'%s' → %s", (size, expected) => {
      const r = parseCapture(`task ${size}`, NOW);
      expect(r.parsedSize).toBe(expected);
      expect(r.cleanText).toBe("task");
    });
  });

  describe("size — word tokens", () => {
    it.each([
      ["~S", "S"],
      ["~M", "M"],
      ["~L", "L"],
      ["~XL", "XL"],
      ["~xs", "S"],
    ])("'%s' → %s", (size, expected) => {
      const r = parseCapture(`task ${size}`, NOW);
      expect(r.parsedSize).toBe(expected);
    });
  });

  describe("dates — relative words", () => {
    it("'today' → today at 9am", () => {
      const r = parseCapture("do it today", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 5, 24, 9, 0, 0));
      expect(r.cleanText).toBe("do it");
    });

    it("'tomorrow' → next day at 9am", () => {
      const r = parseCapture("do it tomorrow", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 5, 25, 9, 0, 0));
    });

    it("'tmrw' and 'tmr' also work", () => {
      expect(parseCapture("x tmrw", NOW).parsedDate).toEqual(new Date(2026, 5, 25, 9, 0, 0));
      expect(parseCapture("x tmr", NOW).parsedDate).toEqual(new Date(2026, 5, 25, 9, 0, 0));
    });

    it("'tonight' → today at 8pm", () => {
      const r = parseCapture("call tonight", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 5, 24, 20, 0, 0));
    });

    it("'next week' → +7 days at 9am", () => {
      const r = parseCapture("review next week", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 6, 1, 9, 0, 0));
    });

    it("'next month' → +1 month at 9am", () => {
      const r = parseCapture("launch next month", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 6, 24, 9, 0, 0));
    });
  });

  describe("dates — weekdays (next occurrence)", () => {
    // NOW is Wednesday 2026-06-24.
    it("'monday' → next Monday (6 days)", () => {
      const r = parseCapture("meet monday", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 5, 29, 9, 0, 0));
    });

    it("'fri' → next Friday (2 days)", () => {
      const r = parseCapture("ship fri", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 5, 26, 9, 0, 0));
    });

    it("'wed' from a Wednesday → next week (7 days, not today)", () => {
      const r = parseCapture("call wed", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 6, 1, 9, 0, 0));
    });
  });

  describe("dates — month names", () => {
    it("'jun 30' → that date this year", () => {
      const r = parseCapture("deadline jun 30", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 5, 30, 9, 0, 0));
    });

    it("'june 30' long form works", () => {
      const r = parseCapture("deadline june 30", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 5, 30, 9, 0, 0));
    });

    it("past month/day rolls to next year", () => {
      // 'jan 5' is before Jun 24 → 2027
      const r = parseCapture("reset jan 5", NOW);
      expect(r.parsedDate).toEqual(new Date(2027, 0, 5, 9, 0, 0));
    });
  });

  describe("dates — numeric M/D", () => {
    it("'6/30' → month/day this year", () => {
      const r = parseCapture("due 6/30", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 5, 30, 9, 0, 0));
    });

    it("'12/25' rolls correctly (future this year)", () => {
      const r = parseCapture("xmas 12/25", NOW);
      expect(r.parsedDate).toEqual(new Date(2026, 11, 25, 9, 0, 0));
    });
  });

  describe("combined tokens (real capture strings)", () => {
    it("parses a full Things-style string", () => {
      const r = parseCapture(
        "Email Sarah re: invoice tomorrow #work !3 ~20m",
        NOW,
      );
      expect(r.cleanText).toBe("Email Sarah re: invoice");
      expect(r.parsedDate).toEqual(new Date(2026, 5, 25, 9, 0, 0));
      expect(r.parsedPriority).toBe("IMPORTANT");
      expect(r.parsedSize).toBe("M"); // 20m → M
      expect(r.parsedTags).toEqual(["#work"]);
    });

    it("collapses extra whitespace after token removal", () => {
      const r = parseCapture("  do   #x   something  ", NOW);
      expect(r.cleanText).toBe("do something");
      expect(r.parsedTags).toEqual(["#x"]);
    });
  });

  describe("edge cases", () => {
    it("returns original text when input is only tokens", () => {
      const r = parseCapture("#work !3 ~XL", NOW);
      expect(r.cleanText).toBe("#work !3 ~XL");
      expect(r.parsedTags).toEqual(["#work"]);
      expect(r.parsedPriority).toBe("IMPORTANT");
      expect(r.parsedSize).toBe("XL");
    });

    it("plain text returns as-is with no tokens", () => {
      const r = parseCapture("just a thought", NOW);
      expect(r.cleanText).toBe("just a thought");
      expect(r.parsedDate).toBeNull();
      expect(r.parsedPriority).toBeNull();
      expect(r.parsedSize).toBeNull();
      expect(r.parsedTags).toEqual([]);
    });

    it("empty string returns empty", () => {
      const r = parseCapture("", NOW);
      expect(r.cleanText).toBe("");
      expect(r.parsedTags).toEqual([]);
    });
  });
});
