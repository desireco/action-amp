// Better Stack error tracking — the frontend tag half of the webapp
// observability port (`old-webapp/src/observability/clientErrorTracking.ts`).
// The tag itself is a static asset (/betterstack.js) whose token and
// collection scope live in Better Stack; this module only decides when the
// app injects it: production builds on the app surface (the root layout
// gates on the shell's territory), never local dev, never the marketing
// site's flow pages.
const TAG_SRC = "/betterstack.js";

export function initBetterStackErrorTracking(): void {
  if (import.meta.env.DEV) return;
  if (document.querySelector(`script[src="${TAG_SRC}"]`)) return;
  const script = document.createElement("script");
  script.src = TAG_SRC;
  script.async = true;
  document.head.appendChild(script);
}
