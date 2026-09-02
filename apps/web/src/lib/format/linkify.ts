/**
 * Linkify — ported from webapp/src/components/ui/Linkify.tsx (S3): bare URLs
 * in captured text render as real links everywhere the text shows.
 *
 * Only `http(s)://` / `www.` tokens linkify (URL-constructor-validated);
 * `target="_blank" rel="noopener noreferrer"`; a bare `www.` gets https;
 * trailing sentence punctuation stays text; query-heavy URLs display the
 * pre-`?` part while the href keeps the full URL.
 */

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;

const TRAILING_DROP = ".,;:!?\"'";
const TRAILING_PAIRS = new Map<string, string>([
  [")", "("],
  ["]", "["],
  ["}", "{"],
  [">", "<"],
]);

export type LinkifySegment =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string; href: string };

/** Trim sentence punctuation hugging a URL token; closing brackets only when unpaired inside the token. */
function trimUrl(token: string): string {
  let end = token.length;
  while (end > 0) {
    const ch = token[end - 1];
    if (TRAILING_DROP.includes(ch)) {
      end -= 1;
    } else {
      const openingPair = ch ? TRAILING_PAIRS.get(ch) : undefined;
      if (!openingPair || token.slice(0, end - 1).includes(openingPair)) break;
      end -= 1;
    }
  }
  return token.slice(0, end);
}

/** Display form: when the query string dominates, show only the pre-`?` part. */
function displayUrl(url: string): string {
  const q = url.indexOf("?");
  return q !== -1 && q < url.length - q ? url.slice(0, q) : url;
}

/** Split `text` into text and URL segments (adjacent text runs merged). */
export function linkifySegments(text: string): LinkifySegment[] {
  const segments: LinkifySegment[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const prev = segments[segments.length - 1];
    if (prev?.kind === "text") prev.value += value;
    else segments.push({ kind: "text", value });
  };
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const url = trimUrl(raw);
    const href = url.startsWith("www.") ? `https://${url}` : url;
    try {
      new URL(href);
    } catch {
      continue;
    }
    const start = match.index ?? 0;
    pushText(text.slice(last, start));
    segments.push({ kind: "url", value: displayUrl(url), href });
    pushText(raw.slice(url.length));
    last = start + raw.length;
  }
  pushText(text.slice(last));
  return segments;
}
