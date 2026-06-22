/**
 * Natural-language capture parser (FEATURES.md F2, Things/TickTick style).
 *
 * Extracts structured tokens from free-text capture and returns them along
 * with the cleaned (token-stripped) text.
 *
 * Syntax:
 *   tomorrow            → date (also: today, next week, weekdays, jun 30, 6/30)
 *   #work  @errands     → tags
 *   !1  !low            → priority (1=low, 2=normal, 3=important)
 *   ~20m  ~1h  ~XL      → size (time→S/M/L/XL: <15m=S, <1h=M, <2h=L, else XL)
 *
 * Used at capture time (server) to populate InboxItem.parsed-* fields, and
 * available client-side for live preview in the capture popover.
 */

export type ParsedPriority = "LOW" | "NORMAL" | "IMPORTANT";
export type ParsedSize = "S" | "M" | "L" | "XL";

export interface ParsedCapture {
  /** The text with all parsed tokens removed, trimmed */
  cleanText: string;
  parsedDate: Date | null;
  parsedPriority: ParsedPriority | null;
  parsedSize: ParsedSize | null;
  parsedTags: string[];
}

const WEEKDAYS = [
  { re: /sunday|sun\b/i, dow: 0 },
  { re: /monday|mon\b/i, dow: 1 },
  { re: /tuesday|tue\b|tues\b/i, dow: 2 },
  { re: /wednesday|wed\b/i, dow: 3 },
  { re: /thursday|thu\b|thur\b|thurs\b/i, dow: 4 },
  { re: /friday|fri\b/i, dow: 5 },
  { re: /saturday|sat\b/i, dow: 6 },
];

const MONTHS: { re: RegExp; month: number }[] = [
  { re: /january|jan\b/i, month: 0 },
  { re: /february|feb\b/i, month: 1 },
  { re: /march|mar\b/i, month: 2 },
  { re: /april|apr\b/i, month: 3 },
  { re: /may\b/i, month: 4 },
  { re: /june|jun\b/i, month: 5 },
  { re: /july|jul\b/i, month: 6 },
  { re: /august|aug\b/i, month: 7 },
  { re: /september|sep\b|sept\b/i, month: 8 },
  { re: /october|oct\b/i, month: 9 },
  { re: /november|nov\b/i, month: 10 },
  { re: /december|dec\b/i, month: 11 },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(9, 0, 0, 0); // 9am default — avoids midnight edge cases
  return x;
}

function nextWeekday(target: number, from: Date): Date {
  const d = new Date(from);
  const cur = d.getDay();
  let diff = (target - cur + 7) % 7;
  if (diff === 0) diff = 7; // "next monday" from monday = next week
  d.setDate(d.getDate() + diff);
  return startOfDay(d);
}

const PRIORITY_WORDS: Record<string, ParsedPriority> = {
  "1": "LOW",
  low: "LOW",
  "2": "NORMAL",
  normal: "NORMAL",
  "3": "IMPORTANT",
  important: "IMPORTANT",
  imp: "IMPORTANT",
  "!!!": "IMPORTANT",
  "!!": "NORMAL",
  "!": "LOW",
};

function sizeFromTime(value: number, unit: "m" | "h"): ParsedSize {
  const minutes = unit === "h" ? value * 60 : value;
  if (minutes < 15) return "S";
  if (minutes < 60) return "M";
  if (minutes < 120) return "L";
  return "XL";
}

const SIZE_WORDS: Record<string, ParsedSize> = {
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  xs: "S",
};

export function parseCapture(raw: string, now: Date = new Date()): ParsedCapture {
  let text = raw;
  const tags: string[] = [];
  let date: Date | null = null;
  let priority: ParsedPriority | null = null;
  let size: ParsedSize | null = null;

  // ---- Tags: #tag or @tag ----
  text = text.replace(/([#@])([a-zA-Z0-9_-]+)/g, (_, prefix, name) => {
    tags.push(`${prefix}${name.toLowerCase()}`);
    return "";
  });

  // ---- Priority: !1/!2/!3 or !word or !/!!/!!! ----
  // Two shapes: a bang + number/word, OR a run of bangs (!{1,3}).
  // Specific pattern first — otherwise !{1,3} grabs just ! from !1.
  // PRIORITY_WORDS keys bang-runs with their leading ! (!/!!/!!!) but
  // keys number/word without (!1 → "1"). ponytail: prior single-regex form
  // was off-by-one on bang counts; this split is the fix.
  text = text.replace(/(!(\d+|[a-z]+)|!{1,3})/i, (match) => {
    if (/^!+$/.test(match)) {
      if (PRIORITY_WORDS[match]) {
        priority = PRIORITY_WORDS[match];
        return "";
      }
    } else {
      const key = match.slice(1).toLowerCase();
      if (PRIORITY_WORDS[key]) {
        priority = PRIORITY_WORDS[key];
        return "";
      }
    }
    return match;
  });

  // ---- Size: ~20m / ~1h / ~XL ----
  text = text.replace(/~(\d+\.?\d*)(m|h)\b/i, (_, val, unit) => {
    size = sizeFromTime(parseFloat(val), unit.toLowerCase() as "m" | "h");
    return "";
  });
  text = text.replace(/~(xs|s|m|l|xl)\b/i, (_match, word) => {
    size = SIZE_WORDS[word.toLowerCase()];
    return "";
  });

  // ---- Dates (order matters: multi-word first) ----
  // next week / next month
  text = text.replace(/\bnext\s+week\b/i, () => {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    date = startOfDay(d);
    return "";
  });
  text = text.replace(/\bnext\s+month\b/i, () => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    date = startOfDay(d);
    return "";
  });

  // today / tomorrow / tonight
  text = text.replace(/\btonight\b/i, () => {
    const d = new Date(now);
    d.setHours(20, 0, 0, 0);
    date = d;
    return "";
  });
  text = text.replace(/\btoday\b/i, () => {
    date = startOfDay(now);
    return "";
  });
  text = text.replace(/\btomorrow\b|\btmrw\b|\btmr\b/i, () => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    date = startOfDay(d);
    return "";
  });

  // weekday names → next occurrence
  for (const { re, dow } of WEEKDAYS) {
    if (re.test(text) && !date) {
      date = nextWeekday(dow, now);
      text = text.replace(re, "");
      break;
    }
  }

  // "jun 30" / "june 30" → that date (this year, or next if past)
  if (!date) {
    for (const { re, month } of MONTHS) {
      // Wrap the month alternation in a non-capturing group so the day
      // pattern applies to the whole — without it, "june|jun\b\s+30" parses
      // as (june) OR (jun\b\s+30), so "june 30" matches "june" alone and
      // drops the day. ponytail: this bit us silently before tests existed.
      const m = text.match(
        new RegExp("(?:" + re.source + ")\\s+(\\d{1,2})", "i"),
      );
      if (m) {
        const day = parseInt(m[1], 10);
        const year = now.getFullYear();
        let d = new Date(year, month, day, 9, 0, 0, 0);
        if (d.getTime() < now.getTime() - 86_400_000) {
          // already past this year → next year
          d = new Date(year + 1, month, day, 9, 0, 0, 0);
        }
        date = startOfDay(d);
        text = text.replace(m[0], "");
        break;
      }
    }
  }

  // "6/30" or "06/30" → M/D date
  if (!date) {
    const m = text.replace(/\b(\d{1,2})\/(\d{1,2})\b/, (_, mm, dd) => {
      const month = parseInt(mm, 10) - 1;
      const day = parseInt(dd, 10);
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        const year = now.getFullYear();
        let d = new Date(year, month, day, 9, 0, 0, 0);
        if (d.getTime() < now.getTime() - 86_400_000) {
          d = new Date(year + 1, month, day, 9, 0, 0, 0);
        }
        date = startOfDay(d);
        return "";
      }
      return _;
    });
    text = m;
  }

  // ---- Collapse extra whitespace + trim ----
  text = text.replace(/\s+/g, " ").trim();

  return {
    cleanText: text || raw.trim(), // keep original if everything was a token
    parsedDate: date,
    parsedPriority: priority,
    parsedSize: size,
    parsedTags: tags,
  };
}
