import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import "./SettingsLayout.css";

/**
 * Shared shell for the settings sub-routes. Renders a sub-nav
 * (Account · Billing · Preferences) above the active page's content, inside the
 * AppShell. Each settings page renders its content through this layout.
 */
const TABS = [
  { label: "Account", to: "/app/settings", exact: true },
  { label: "Billing", to: "/app/settings/billing", exact: false },
  { label: "Preferences", to: "/app/settings/preferences", exact: false },
  { label: "Lenses", to: "/app/settings/lenses", exact: false },
  { label: "Access tokens", to: "/app/settings/pat", exact: false },
];

export function SettingsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="aa-settings-hub">
      <Link className="aa-settings-back" to="/app">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Next
      </Link>

      <h1 className="aa-settings-h">Settings</h1>

      <nav className="aa-settings-tabs" aria-label="Settings">
        {TABS.map((tab) => {
          const active = tab.exact
            ? location.pathname === tab.to
            : location.pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`aa-settings-tab ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="aa-settings-body">{children}</div>
    </div>
  );
}
