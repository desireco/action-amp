import {
  safePath,
  sanitizeErrorText,
  sanitizeStack,
} from "./errorSanitization";

type ClientErrorKind = "react" | "window" | "promise";
type ClientErrorContext = {
  kind: ClientErrorKind;
  componentStack?: string | null;
};

const recentFingerprints = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;
const BETTER_STACK_BOOTSTRAP_SRC = "/betterstack.js";

function loadBetterStackTag(): void {
  if (document.querySelector(`script[src="${BETTER_STACK_BOOTSTRAP_SRC}"]`)) {
    return;
  }
  const script = document.createElement("script");
  script.src = BETTER_STACK_BOOTSTRAP_SRC;
  script.async = true;
  document.head.appendChild(script);
}

function scheduleBetterStackTag(): void {
  // The static Wasp head participates in SSR hydration. Mutating it before
  // React commits causes a recoverable hydration failure, so load telemetry
  // only after the browser's load event.
  if (document.readyState === "complete") {
    window.setTimeout(loadBetterStackTag, 0);
    return;
  }
  window.addEventListener("load", loadBetterStackTag, { once: true });
}

function endpoint(): string {
  const apiOrigin = (import.meta.env.REACT_APP_API_URL ?? "").replace(
    /\/$/,
    "",
  );
  return `${apiOrigin}/api/errors/client`;
}

function toError(error: Error | string): Error {
  if (error instanceof Error) return error;
  return new Error(sanitizeErrorText(error));
}

function shouldReport(error: Error, now = Date.now()): boolean {
  const fingerprint = `${error.name}:${error.message}:${error.stack?.split("\n", 2)[1] ?? ""}`;
  const previous = recentFingerprints.get(fingerprint);
  recentFingerprints.set(fingerprint, now);
  for (const [key, seenAt] of recentFingerprints) {
    if (now - seenAt > DEDUPE_WINDOW_MS) recentFingerprints.delete(key);
  }
  return previous === undefined || now - previous > DEDUPE_WINDOW_MS;
}

export function captureClientError(
  cause: Error | string,
  context: ClientErrorContext,
): void {
  if (import.meta.env.DEV) return;
  const error = toError(cause);
  if (!shouldReport(error)) return;

  const payload = JSON.stringify({
    kind: context.kind,
    name: sanitizeErrorText(error.name, 100),
    message: sanitizeErrorText(error.message),
    stack: sanitizeStack(error.stack),
    componentStack: sanitizeStack(context.componentStack),
    path: safePath(window.location.pathname),
    release: __APP_VERSION__,
  });

  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(
      endpoint(),
      new Blob([payload], { type: "text/plain;charset=UTF-8" }),
    );
    if (sent) return;
  }

  void fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Error reporting must never become a second user-visible failure.
  });
}

/** Installed by Wasp before React mounts; the SDK remains provider-free. */
export async function initializeClientErrorTracking(): Promise<void> {
  if (import.meta.env.DEV || import.meta.env.SSR) return;
  scheduleBetterStackTag();
  window.addEventListener("error", (event) => {
    captureClientError(
      event.error instanceof Error ? event.error : event.message,
      { kind: "window" },
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    captureClientError(
      event.reason instanceof Error
        ? event.reason
        : "Unhandled promise rejection",
      { kind: "promise" },
    );
  });
}

export const clientErrorTrackingTestUtils = { shouldReport, toError };
