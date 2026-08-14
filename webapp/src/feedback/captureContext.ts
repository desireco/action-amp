/**
 * Shared client-side context capture for feedback submission.
 *
 * Every submitFeedback call site (AppShell's loudspeaker button, TodayPage's
 * done-task feedback, TaskDetailPage's done-task feedback) used to gather this
 * independently — and they disagreed: two sent pathname-only (no query string)
 * and hardcoded section:"work". This helper is the single source of truth, so
 * all three triggers record identical context for the same screen.
 *
 * Pure (no React, no wasp import) so it's unit-testable in the node Vitest
 * environment. All browser-API access is SSR-guarded.
 */

export type FeedbackSection = "work" | "plan" | "review";

/** The context block submitFeedback expects alongside `message` + `lens`. */
export type FeedbackCaptureContext = {
  route: string;
  section: FeedbackSection;
  userAgent: string | null;
  /** "WxH" (innerWidth x innerHeight), or null when unavailable. */
  viewport: string | null;
  /** IANA timezone (e.g. "America/Toronto"), or null when unavailable. */
  timezone: string | null;
};

/**
 * Which focus section a route belongs to. Used only as freeform context for
 * feedback (the focus switch itself is gone — Plan and Review are always-open
 * nav groups, not expanding sections). Universal routes (Today, Inbox) and the
 * Do/Next route fall through to "work" so feedback always carries some context.
 *
 * Exported for unit tests + for AppShell's back-compat re-export.
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
  // Do/Next, Today, Inbox, and unknown paths all default to "work" — the
  // focus-area label for feedback context.
  return "work";
}

/**
 * Gather the full feedback context block for the current location.
 *
 * @param location pathname + search (from react-router's useLocation).
 *   route = pathname + search so query-string UI state (selected filters, etc.)
 *   is captured — the previous per-site calls dropped the search.
 */
export function captureFeedbackContext(location: {
  pathname: string;
  search: string;
}): FeedbackCaptureContext {
  const hasWindow = typeof window !== "undefined";

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
