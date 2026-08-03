import { Outlet, useLocation, Navigate, ScrollRestoration } from "react-router";
import { useAuth } from "wasp/client/auth";
import { AppShell } from "./app/AppShell";
import { StatCounter } from "./analytics/StatCounter";
import "./App.css";

/**
 * The root layout. Wasp renders this as the parent of every route, so it stays
 * mounted across all navigation — only <Outlet/> (the matched page) swaps.
 *
 * We render the authenticated AppShell once for any /app/* path. Lifting the
 * shell here (instead of wrapping it in each page) means the sidebar never
 * remounts on navigation: no flicker, no lost scroll, no re-subscribing auth.
 * Public pages (/, /login, /about, ...) render bare.
 *
 * First-run gate: an authenticated user who hasn't completed onboarding
 * (`User.hasSeenOnboarding === false`) is redirected to /welcome exactly once.
 * The flag is server-side, so this works across devices/browsers (the old
 * localStorage gate didn't). `onAuthSucceededRedirectTo: "/app"` stays the
 * post-onboarding default — the gate here intercepts the first arrival.
 */
export function App() {
  const location = useLocation();
  const { data: user, status } = useAuth();
  const isApp = location.pathname.startsWith("/app");

  // Auth gate. Wasp wraps each *page* in `createAuthRequiredPage`, but this is
  // the layout (the `rootElement`), so it isn't wrapped. Without a gate here,
  // the shell mounts and renders interactive chrome (capture FAB, logout)
  // during session resolution and when the session is stale/null — letting the
  // user fire auth-required actions that 500 ("Not authenticated") or 401
  // ("Invalid credentials"). So we gate at the layout too: wait for the session
  // to resolve, and send a resolved-but-null user to "/login" rather than a broken
  // /app. Mirrors the per-page gate's behavior (same `status` field) but one
  // level up, where the chrome lives. Scoped to /app* — public pages stay bare.
  if (isApp) {
    if (status === "loading") return null;
    if (!user) return <Navigate to="/login" replace />;
  }

  // First-run redirect: send brand-new users to onboarding before /app.
  // Scoped to /app* paths only — we don't want to yank an authenticated-but-
  // unonboarded user off /email-verification, /about, /founding-100/welcome,
  // etc. (those should stay reachable). Skip when already on /welcome (avoid a
  // loop) or while the auth session is still resolving (user undefined).
  if (
    user &&
    user.hasSeenOnboarding === false &&
    isApp &&
    location.pathname !== "/welcome"
  ) {
    return <Navigate to="/welcome" replace />;
  }

  return isApp ? (
    <>
      <StatCounter />
      <AppShell>
        <Outlet />
      </AppShell>
    </>
  ) : (
    <>
      <StatCounter />
      {/* Scroll to top on route change. Without this, navigating between
          public pages inherits the previous page's scroll offset — so
          clicking a footer link (bottom of page) landed you at the bottom
          of /roadmap or /founding-100. The landing page's scroll-snap
          masked this on `/`, but content pages exposed it. This component
          belongs at the root layout; it handles every route in one place. */}
      <ScrollRestoration />
      <Outlet />
    </>
  );
}
