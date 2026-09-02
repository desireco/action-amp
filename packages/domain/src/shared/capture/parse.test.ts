import { describe, expect, it } from "vitest";
import { parseCapture } from "./parse.js";

// Table-driven parser tests. parseCapture is a pure function — the highest-
// leverage test target in the codebase (every capture + every chip preview
// runs through it). Covers grammar v2 (locked 2026-07-04, see
// docs/specs/capture-grammar.md): #tags, @time-only, [[lens]], priority/size.

describe("parseCapture", () => {
  // Fixed "now" so relative date tests are deterministic: Wed 2026-06-24 10:00
  const NOW = new Date(2026, 5, 24, 10, 0, 0); // June = month index 5
  const scheduled = (value: string) =>
    new Date(`${value}T00:00:00.000Z`);

  describe("project (#)", () => {
    it.each([
      ["email #work", "work"],
      ["ship the #mvp feature", "mvp"],
    ])("'%s' → project %j", (input, project) => {
      const r = parseCapture(input, NOW);
      expect(r.parsedProject).toBe(project);
      // A lone #project is NOT a tag.
      expect(r.parsedTags).toEqual([]);
    });

    it("lowercases the project hint", () => {
      expect(parseCapture("Email #MVP", NOW).parsedProject).toBe("mvp");
    });

    it("supports bracketed project hints for multi-word autocomplete picks", () => {
      const r = parseCapture("Email Sarah #[Q3 Launch]", NOW);
      expect(r.parsedProject).toBe("q3 launch");
      expect(r.parsedTags).toEqual([]);
      expect(r.cleanText).toBe("Email Sarah");
    });

    it("only the FIRST #token is the project; extras fall through to tags", () => {
      // Rare but lossless: a second #token stays as a tag.
      const r = parseCapture("x #mvp #extra", NOW);
      expect(r.parsedProject).toBe("mvp");
      expect(r.parsedTags).toEqual(["#extra"]);
    });
  });

  describe("tags (#)", () => {
    // Under the first-#-wins rule, the first #token is the project hint and
    // only subsequent #tokens are tags. These tests use a leading #project to
    // leave the named tokens as tags. The single-# case is in `project (#)`.
    it.each([
      ["x #proj #errands", ["#errands"], "x"],
      ["x #proj #errands #home", ["#errands", "#home"], "x"],
    ])("'%s' → tags %j, text %j", (input, tags, text) => {
      const r = parseCapture(input, NOW);
      expect(r.parsedProject).toBe("proj");
      expect(r.parsedTags).toEqual(tags);
      expect(r.cleanText).toBe(text);
    });

    it("lowercases tag names", () => {
      // First # → project, second #WORK → tag
      const r = parseCapture("x #proj #WORK", NOW);
      expect(r.parsedProject).toBe("proj");
      expect(r.parsedTags).toEqual(["#work"]);
    });
  });

  describe("@ is time-only (grammar v2)", () => {
    it("@phone stays literal (not a tag)", () => {
      const r = parseCapture("email @phone", NOW);
      expect(r.parsedTags).toEqual([]);
      expect(r.cleanText).toBe("email @phone");
    });

    it("@errands @home stay literal", () => {
      const r = parseCapture("buy milk @errands @home", NOW);
      expect(r.parsedTags).toEqual([]);
      expect(r.cleanText).toBe("buy milk @errands @home");
    });

    it("@today sets the date (not a tag)", () => {
      const r = parseCapture("work on capture @today", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-24"));
      expect(r.parsedTags).not.toContain("@today");
      expect(r.cleanText).toBe("work on capture");
    });

    it("@tomorrow / @tmrw / @tmr set the date", () => {
      expect(parseCapture("ship @tomorrow", NOW).parsedScheduledDate).toEqual(
        scheduled("2026-06-25"),
      );
      expect(parseCapture("ship @tmrw", NOW).parsedScheduledDate).toEqual(
        scheduled("2026-06-25"),
      );
      expect(parseCapture("ship @tmr", NOW).parsedScheduledDate).toEqual(
        scheduled("2026-06-25"),
      );
    });

    it("@tonight sets today at 8pm", () => {
      const r = parseCapture("call @tonight", NOW);
      expect(r.parsedScheduledDate).toBeNull();
      expect(r.parsedSnoozedUntil).toEqual(new Date(2026, 5, 24, 20, 0, 0));
    });
  });

  describe("lens override ([[ ]])", () => {
    it("[[work]] → parsedLens work, stripped from text", () => {
      const r = parseCapture("call [[work]] about MVP", NOW);
      expect(r.parsedLens).toBe("work");
      expect(r.cleanText).toBe("call about MVP");
    });

    it("[[personal]] and [[me]] both resolve (PERSONAL kind)", () => {
      expect(parseCapture("[[personal]] errand", NOW).parsedLens).toBe("personal");
      expect(parseCapture("[[me]] errand", NOW).parsedLens).toBe("me");
    });

    it("lowercases the lens token", () => {
      expect(parseCapture("x [[Work]]", NOW).parsedLens).toBe("work");
    });

    it("unknown token stays literal (no false positive on pasted wiki-links)", () => {
      const r = parseCapture("[[xyzzy]] thing", NOW);
      expect(r.parsedLens).toBeNull();
      expect(r.cleanText).toBe("[[xyzzy]] thing");
    });

    it("first [[ ]] wins; a second stays literal (lossless)", () => {
      const r = parseCapture("[[work]] and [[personal]]", NOW);
      expect(r.parsedLens).toBe("work");
      expect(r.cleanText).toBe("and [[personal]]");
    });

    it("custom lens name recognized when passed via knownLensNames", () => {
      const r = parseCapture("ship [[studio]]", NOW, ["Studio", "Q3 Launch"]);
      expect(r.parsedLens).toBe("studio");
      expect(r.cleanText).toBe("ship");
    });

    it("custom lens name not in knownLensNames stays literal", () => {
      const r = parseCapture("ship [[studio]]", NOW);
      expect(r.parsedLens).toBeNull();
      expect(r.cleanText).toBe("ship [[studio]]");
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
      ["task !high", "IMPORTANT"],
      ["task !h", "IMPORTANT"],
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
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-24"));
      expect(r.cleanText).toBe("do it");
    });

    it("'tomorrow' → next day at 9am", () => {
      const r = parseCapture("do it tomorrow", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-25"));
    });

    it("'tmrw' and 'tmr' also work", () => {
      expect(parseCapture("x tmrw", NOW).parsedScheduledDate).toEqual(scheduled("2026-06-25"));
      expect(parseCapture("x tmr", NOW).parsedScheduledDate).toEqual(scheduled("2026-06-25"));
    });

    it("'tonight' → today at 8pm", () => {
      const r = parseCapture("call tonight", NOW);
      expect(r.parsedScheduledDate).toBeNull();
      expect(r.parsedSnoozedUntil).toEqual(new Date(2026, 5, 24, 20, 0, 0));
    });

    it("'next week' → +7 days at 9am", () => {
      const r = parseCapture("review next week", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-07-01"));
    });

    it("'next month' → +1 month at 9am", () => {
      const r = parseCapture("launch next month", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-07-24"));
    });
  });

  describe("dates — weekdays (next occurrence)", () => {
    // NOW is Wednesday 2026-06-24.
    it("'monday' → next Monday (6 days)", () => {
      const r = parseCapture("meet monday", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-29"));
    });

    it("'fri' → next Friday (2 days)", () => {
      const r = parseCapture("ship fri", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-26"));
    });

    it("'wed' from a Wednesday → next week (7 days, not today)", () => {
      const r = parseCapture("call wed", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-07-01"));
    });
  });

  describe("dates — month names", () => {
    it("'jun 30' → that date this year", () => {
      const r = parseCapture("deadline jun 30", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-30"));
    });

    it("'june 30' long form works", () => {
      const r = parseCapture("deadline june 30", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-30"));
    });

    it("past month/day rolls to next year", () => {
      // 'jan 5' is before Jun 24 → 2027
      const r = parseCapture("reset jan 5", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2027-01-05"));
    });
  });

  describe("dates — numeric M/D", () => {
    it("'6/30' → month/day this year", () => {
      const r = parseCapture("due 6/30", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-30"));
    });

    it("'12/25' rolls correctly (future this year)", () => {
      const r = parseCapture("xmas 12/25", NOW);
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-12-25"));
    });
  });

  describe("combined tokens (real capture strings)", () => {
    it("parses a full Things-style string (#mvp is the project hint)", () => {
      const r = parseCapture(
        "Email Sarah re: invoice tomorrow #mvp !3 ~20m",
        NOW,
      );
      expect(r.cleanText).toBe("Email Sarah re: invoice");
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-25"));
      expect(r.parsedPriority).toBe("IMPORTANT");
      expect(r.parsedSize).toBe("M"); // 20m → M
      expect(r.parsedProject).toBe("mvp"); // first #token → project
      expect(r.parsedTags).toEqual([]);
    });

    it("parses a [[lens]]-tagged cross-lens capture", () => {
      const r = parseCapture("[[work]] ship the launch deck tomorrow !2", NOW);
      expect(r.parsedLens).toBe("work");
      expect(r.cleanText).toBe("ship the launch deck");
      expect(r.parsedScheduledDate).toEqual(scheduled("2026-06-25"));
      expect(r.parsedPriority).toBe("NORMAL");
    });

    it("collapses extra whitespace after token removal", () => {
      const r = parseCapture("  do   #x   something  ", NOW);
      expect(r.cleanText).toBe("do something");
      expect(r.parsedProject).toBe("x"); // first # → project
      expect(r.parsedTags).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("returns original text when input is only tokens", () => {
      const r = parseCapture("#mvp !3 ~XL", NOW);
      expect(r.cleanText).toBe("#mvp !3 ~XL");
      expect(r.parsedProject).toBe("mvp"); // first # → project
      expect(r.parsedTags).toEqual([]);
      expect(r.parsedPriority).toBe("IMPORTANT");
      expect(r.parsedSize).toBe("XL");
    });

    it("plain text returns as-is with no tokens", () => {
      const r = parseCapture("just a thought", NOW);
      expect(r.cleanText).toBe("just a thought");
      expect(r.parsedScheduledDate).toBeNull();
      expect(r.parsedPriority).toBeNull();
      expect(r.parsedSize).toBeNull();
      expect(r.parsedTags).toEqual([]);
      expect(r.parsedProject).toBeNull();
      expect(r.parsedLens).toBeNull();
    });

    it("empty string returns empty", () => {
      const r = parseCapture("", NOW);
      expect(r.cleanText).toBe("");
      expect(r.parsedTags).toEqual([]);
      expect(r.parsedProject).toBeNull();
      expect(r.parsedLens).toBeNull();
    });
  });
});
