/**
 * Linkify — render plain text with bare URLs turned into real links.
 *
 * For surfaces that show captured text verbatim (the inbox queue) but where a
 * pasted URL should still behave like a link: clickable, new tab, hardened
 * with `rel="noopener noreferrer"`. Rendering is React elements only — never
 * `dangerouslySetInnerHTML` — and only `http(s)://` / `www.` tokens are
 * linkified, so the href's scheme is forced to https and `javascript:`-style
 * payloads stay inert text.
 *
 * Styling lives with each caller (`.aa-linkify`); Markdown.tsx's link look
 * (subtle underline, teal on hover) is the reference treatment.
 */

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;

const TRAILING_DROP = ".,;:!?\"'";
const TRAILING_PAIRS: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
  ">": "<",
};

export type LinkifySegment =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string; href: string };

/**
 * Trim sentence punctuation that hugs a URL token but isn't part of it —
 * "see https://x.dev/a." keeps the period out of the href. Closing brackets
 * go only when unpaired inside the token: Wikipedia's `Foo_(bar)` keeps its
 * paren, prose like "(https://x.dev)" loses it.
 */
function trimUrl(token: string): string {
  let end = token.length;
  while (end > 0) {
    const ch = token[end - 1];
    if (TRAILING_DROP.includes(ch)) {
      end -= 1;
    } else if (TRAILING_PAIRS[ch] && !token.slice(0, end - 1).includes(TRAILING_PAIRS[ch])) {
      end -= 1;
    } else {
      break;
    }
  }
  return token.slice(0, end);
}

/** Split `text` into text and URL segments. Anything the URL constructor
 *  rejects stays plain text; adjacent text runs (e.g. a trimmed trailing
 *  comma followed by more prose) are merged into one segment. */
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
    segments.push({ kind: "url", value: url, href });
    pushText(raw.slice(url.length));
    last = start + raw.length;
  }
  pushText(text.slice(last));
  return segments;
}

export function Linkify({ text }: { text: string }) {
  const segments = linkifySegments(text);
  if (!segments.some((segment) => segment.kind === "url")) return <>{text}</>;
  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === "url" ? (
          <a
            key={i}
            className="aa-linkify"
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {segment.value}
          </a>
        ) : (
          segment.value
        ),
      )}
    </>
  );
}
