/**
 * The share URL the toolbar button opens — the bookmarklet's grammar
 * (bookmarklet/actionamp-share.src.js): title + URL + selection, each
 * capped at the app's 2000-char field limit, into the /share review page.
 * Kept as a plain module so the unit test can import it without Chrome.
 */
export const FIELD_CAP = 2000;

/** The capture target when the user hasn't set one (Options page). */
export const DEFAULT_ORIGIN = "https://app.actionamp.com";

export function shareUrl({ origin, title, url, text }) {
  const params = new URLSearchParams();
  params.set("title", String(title ?? "").trim().slice(0, FIELD_CAP));
  params.set("url", String(url ?? ""));
  const selection = String(text ?? "").trim();
  if (selection) params.set("text", selection.slice(0, FIELD_CAP));
  return `${origin}/share?${params}`;
}
