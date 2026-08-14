import { Outlet, useLocation, Navigate, ScrollRestoration } from "react-router";
import { useEffect } from "react";
import { useAuth } from "wasp/client/auth";
import { AppShell } from "./app/AppShell";
import { SplashScreen } from "./components/ui";
import { StatCounter, trackStatCounterEvent } from "./analytics/StatCounter";
import { trackAnalyticsEvent } from "./analytics/tracking";
import "./App.css";

/**
 * The root layout. Wasp renders this as the parent of every route, so it stays
 * mounted across all navigation — only <Outlet/> (the matched page) swaps.
 *
 * We render the authenticated AppShell once for any /do/* path. Lifting the
 * shell here (instead of wrapping it in each page) means the sidebar never
 * remounts on navigation: no flicker, no lost scroll, no re-subscribing auth.
 * Public pages (/, /login, /about, ...) render bare.
 *
 * First-run gate: an authenticated user who hasn't completed onboarding
 * (`User.hasSeenOnboarding === false`) is redirected to /welcome exactly once.
 * The flag is server-side, so this works across devices/browsers (the old
 * localStorage gate didn't). `onAuthSucceededRedirectTo: "/do"` stays the
 * post-onboarding default — the gate here intercepts the first arrival.
 */
export function App() {
  const location = useLocation();
  const { data: user, status } = useAuth();
  const isApp = location.pathname.startsWith("/do");
  const isAdminWorkspace = location.pathname.startsWith("/do/admin") || location.pathname === "/do/settings/admin";

  useEffect(() => {
    if (user && isApp && location.pathname !== "/do/settings/admin") {
      trackAnalyticsEvent({ name: "APP_OPENED", route: location.pathname });
      const firstOpenKey = "actionamp.statcounter.app_first_open";
      if (!window.localStorage.getItem(firstOpenKey)) {
        window.localStorage.setItem(firstOpenKey, "1");
        trackStatCounterEvent("app_first_open", "app");
      }
    }
  }, [user?.id, isApp]);

  // Auth gate. Wasp wraps each *page* in `createAuthRequiredPage`, but this is
  // the layout (the `rootElement`), so it isn't wrapped. Without a gate here,
  // the shell mounts and renders interactive chrome (capture FAB, logout)
  // during session resolution and when the session is stale/null — letting the
  // user fire auth-required actions that 500 ("Not authenticated") or 401
  // ("Invalid credentials"). So we gate at the layout too: wait for the session
  // to resolve, and send a resolved-but-null user to "/login" rather than a broken
  // /do. Mirrors the per-page gate's behavior (same `status` field) but one
  // level up, where the chrome lives. Scoped to /do* — public pages stay bare.
  // While the session resolves, the welcome veil covers the blank layout; when
  // it resolves, this commit also mounts the page, whose own veil (NextPage)
  // is opaque from frame one — the swap is invisible.
  if (isApp) {
    if (status === "loading") return <SplashScreen />;
    if (!user) return <Navigate to="/login" replace />;
  }

  // First-run redirect: send brand-new users to onboarding before /do.
  // Scoped to /do* paths only — we don't want to yank an authenticated-but-
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

  return isApp && !isAdminWorkspace ? (
    <>
      <StatCounter />
      <AppShell>
        <Outlet />
      </AppShell>
    </>
  ) : isApp ? (
    <>
      <StatCounter />
      <Outlet />
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
