import { Outlet, useLocation } from "react-router";
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
 */
export function App() {
  const location = useLocation();
  const isApp = location.pathname.startsWith("/app");
  return isApp ? (
    <AppShell>
      <Outlet />
    </AppShell>
  ) : (
    <Outlet />
  );
}
