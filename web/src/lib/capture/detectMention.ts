/**
 * Detect an open mention token at the caret position inside capture text.
 *
 * Three token families open the autocomplete (#8): `#` projects, `[[` lenses,
 * and `!` priority words. "Open" = the caret sits inside the chars after a
 * trigger that itself sits at a token boundary (start of input, or preceded
 * by whitespace). If the user has typed a space/newline/another trigger
 * since, the token is closed and there's no active mention. Returns the
 * token's text span + kind + the partial query so the dropdown can position
 * itself and filter results.
 *
 * A `!` mid-word ("Hello!") is a literal, not a trigger — the boundary check
 * keeps prose exclamation out of the priority autocomplete.
 *
 * Pure + testable: no DOM. CapturePopover calls this on every text change +
 * caret move.
 */
export type MentionKind = "project" | "lens" | "priority";

export interface MentionState {
  kind: MentionKind;
  /** Index of the token's first trigger char (`#`, `[`, `!`) in the source. */
  at: number;
  /** Index just past the last char of the partial query (== caretIndex). */
  end: number;
  /** The partial query (text between the trigger and the caret), lowercased. */
  query: string;
}

export function detectMention(text: string, caretIndex: number): MentionState | null {
  if (caretIndex < 1) return null;
  // Walk back from the caret to find the trigger that opened this token.
  // Stop at the first whitespace — that closes the token.
  let i = caretIndex - 1;
  while (i >= 0) {
    const ch = text[i];
    if (/\s/.test(ch)) return null;
    // `[[lens` — the double bracket opens a lens token.
    if (ch === "[" && i > 0 && text[i - 1] === "[") {
      const before = i > 1 ? text[i - 2] : "";
      if (i - 1 === 0 || /\s/.test(before)) {
        return {
          kind: "lens",
          at: i - 1,
          end: caretIndex,
          query: text.slice(i + 1, caretIndex).toLowerCase(),
        };
      }
      return null;
    }
    if (ch === "#" || ch === "!") {
      // The trigger must be at a token boundary: start of input, or preceded
      // by whitespace. Otherwise it's a literal inside a word ("C#", "Hello!").
      const before = i > 0 ? text[i - 1] : "";
      if (i === 0 || /\s/.test(before)) {
        return {
          kind: ch === "#" ? "project" : "priority",
          at: i,
          end: caretIndex,
          query: text.slice(i + 1, caretIndex).toLowerCase(),
        };
      }
      return null;
    }
    i--;
  }
  return null;
}
