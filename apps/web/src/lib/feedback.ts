/**
 * Shared client-side context capture for feedback submission — the port of
 * webapp/src/feedback/captureContext.ts. Every feedback submit carries the
 * same context block for the same screen (route incl. query string, focus
 * section, user agent, viewport, timezone), so triage can reconstruct where
 * a report came from.
 *
 * Pure (no DOM imports beyond guarded window reads) so it stays unit-testable
 * in the node Vitest environment.
 */

export type FeedbackSection = "work" | "plan" | "review";

/** The context block the feedback submit op expects alongside `message`. */
export interface FeedbackContext {
  route: string;
  section: FeedbackSection;
  userAgent: string | null;
  /** "WxH" (innerWidth x innerHeight), or null when unavailable. */
  viewport: string | null;
  /** IANA timezone (e.g. "America/Toronto"), or null when unavailable. */
  timezone: string | null;
}

/**
 * Which focus section a route belongs to. Used only as freeform context for
 * feedback (the focus switch itself is gone — Plan and Review are always-open
 * nav groups, not expanding sections). Universal routes (Today, Inbox) and
 * the app home fall through to "work" so feedback always carries some context.
 */
export function sectionForPath(pathname: string): FeedbackSection {
  if (
    pathname.startsWith("/do/upcoming") ||
    pathname.startsWith("/do/projects") ||
    pathname.startsWith("/do/goals") ||
    pathname.startsWith("/do/someday")
  ) {
    return "plan";
  }
  if (pathname.startsWith("/do/logbook") || pathname.startsWith("/do/review")) return "review";
  // The app home, Today, Inbox, and unknown paths all default to "work" — the
  // focus-area label for feedback context.
  return "work";
}

/**
 * Gather the full feedback context block for the current location.
 *
 * `route` = pathname + search so query-string UI state (selected filters,
 * etc.) is captured — the webapp's early call sites dropped the search.
 */
export function captureFeedbackContext(location: {
  pathname: string;
  search: string;
}): FeedbackContext {
  const hasWindow = typeof window !== "undefined";

  // SAFETY: assertion is safe — value is validated or from a trusted source.
  const w = hasWindow ? (window as { innerWidth?: number; innerHeight?: number }) : undefined;
  const viewport =
    w && typeof w.innerWidth === "number" && typeof w.innerHeight === "number"
      ? `${w.innerWidth}x${w.innerHeight}`
      : null;

  let timezone: string | null = null;
  if (hasWindow) {
    try {
      // Intl is available in every modern browser + node; guard for the rare
      // stripped-down env that throws on resolvedOptions().
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      timezone = null;
    }
  }

  return {
    route: `${location.pathname}${location.search}`,
    section: sectionForPath(location.pathname),
    userAgent: hasWindow ? window.navigator.userAgent : null,
    viewport,
    timezone,
  };
}
