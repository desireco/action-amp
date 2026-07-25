// Composes the share payload's title/text/url fields into the single `text`
// string stored on the InboxItem. Pure; unit-tested.
//
// Rules (see docs/superpowers/specs/2026-07-25-pwa-share-target-design.md):
//   title + url → "Title — url"
//   title only  → "Title"
//   url only    → "url"
//   text + url  → "text — url"
//   text only   → "text"
//   title + text + url → "Title: text — url"
//   nothing     → ""  (caller treats as error)
// Each field is truncated to MAX_FIELD_LEN chars (+ "…") before composing.

const MAX_FIELD_LEN = 2000;

export type ShareFields = {
  title?: string;
  text?: string;
  url?: string;
};

function clean(v: string | undefined): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  if (trimmed.length <= MAX_FIELD_LEN) return trimmed;
  return trimmed.slice(0, MAX_FIELD_LEN) + "…";
}

export function composeShareText(fields: ShareFields): string {
  const title = clean(fields.title);
  const text = clean(fields.text);
  const url = clean(fields.url);

  // No content at all → empty (caller decides what to do).
  if (!title && !text && !url) return "";

  // URL always appended last, after " — ", when present.
  const tail = url ? ` — ${url}` : "";

  if (title && text) return `${title}: ${text}${tail}`;
  if (title) return `${title}${tail}`;
  if (text) return `${text}${tail}`;
  // Only url.
  return url;
}
