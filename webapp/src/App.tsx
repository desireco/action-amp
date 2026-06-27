import { Outlet, useLocation, Navigate } from "react-router";
import { useAuth } from "wasp/client/auth";
import { AppShell } from "./app/AppShell";
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
  const { data: user } = useAuth();
  const isApp = location.pathname.startsWith("/app");

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
    <AppShell>
      <Outlet />
    </AppShell>
  ) : (
    <Outlet />
  );
}
