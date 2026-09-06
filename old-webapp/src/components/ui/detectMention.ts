/**
 * Detect an open `#`-mention token at the caret position inside capture text.
 *
 * "Open" = the caret sits inside the chars after a `#` that itself sits at a
 * token boundary (start of input, or preceded by whitespace). If the user has
 * typed a space/newline/another `#` since, the token is closed and there's no
 * active mention. Returns the token's text span + the partial query so the
 * dropdown can position itself and filter results.
 *
 * Pure + testable: no DOM, no React. CapturePopover calls this on every text
 * change + caret move.
 */
export interface MentionState {
  /** Index of the `#` trigger character in the source string. */
  at: number;
  /** Index just past the last char of the partial query (== caretIndex). */
  end: number;
  /** The partial query (text between `#` and the caret), lowercased. */
  query: string;
}

export function detectMention(text: string, caretIndex: number): MentionState | null {
  if (caretIndex < 1) return null;
  // Walk back from the caret to find the `#` that opened this token. Stop at
  // the first whitespace, newline, or another `#` — those close the token.
  let i = caretIndex - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "#") {
      // The `#` must be at a token boundary: start of input, or preceded by
      // whitespace. Otherwise it's a literal `#` inside a word (e.g. "C#").
      const before = i > 0 ? text[i - 1] : "";
      if (i === 0 || /\s/.test(before)) {
        return {
          at: i,
          end: caretIndex,
          query: text.slice(i + 1, caretIndex).toLowerCase(),
        };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}
