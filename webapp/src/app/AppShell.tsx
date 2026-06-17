import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useAuth, logout } from "wasp/client/auth";
import "./AppShell.css";

/**
 * Minimal authenticated app shell — the eventual home of the full sidebar
 * chrome (PAGES.md §0). For now: brand, the active nav item, dimmed "soon"
 * items that communicate the IA, and the user + logout at the bottom.
 *
 * Wasp 0.24 has no layout route wrapper, so every /app page renders this.
 */
const NAV = [
  { label: "What Now", to: "/app", soon: false },
  { label: "Inbox", to: "/app/inbox", soon: true },
  { label: "Today", to: "/app/today", soon: true },
  { label: "Projects", to: "/app/projects", soon: true },
  { label: "Goals", to: "/app/goals", soon: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useAuth();
  const location = useLocation();

  return (
    <div className="aa-app">
      <aside className="aa-app-side">
        <Link className="aa-app-brand" to="/">
          <span className="aa-app-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 8.5l3 3 6-7"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          ActionAmp
        </Link>

        <nav className="aa-app-nav">
          {NAV.map((item) => {
            const active = location.pathname === item.to;
            return (
              <span
                key={item.to}
                className={`aa-app-nav-item ${active ? "active" : ""} ${
                  item.soon ? "soon" : ""
                }`}
                title={item.soon ? "Coming soon" : undefined}
              >
                {item.label}
                {item.soon && <em>soon</em>}
              </span>
            );
          })}
        </nav>

        <div className="aa-app-user">
          <Link
            to="/app/settings"
            className={`aa-app-user-name ${location.pathname === "/app/settings" ? "active" : ""}`}
            title="Settings"
          >
            {user ? `${user.firstName} ${user.lastName}` : ""}
          </Link>
          <button
            type="button"
            className="aa-app-logout"
            onClick={() => logout()}
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="aa-app-main">{children}</main>
    </div>
  );
}
