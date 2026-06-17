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
];

export function SettingsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="aa-settings-hub">
      <Link className="aa-settings-back" to="/app">
        ← What Now
      </Link>

      <h1 className="aa-settings-h">Settings</h1>

      <nav className="aa-settings-tabs">
        {TABS.map((tab) => {
          const active = tab.exact
            ? location.pathname === tab.to
            : location.pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`aa-settings-tab ${active ? "active" : ""}`}
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
