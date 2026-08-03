import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "wasp/client/auth";
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

export function SettingsLayout({
  children,
  fullWidth = false,
}: {
  children: ReactNode;
  /**
   * Drop the default 760px max-width so wide content (the admin dashboard's
   * tile grid + feedback table) can use the full AppShell content width.
   * Default settings pages stay narrow — full-width form fields read poorly.
   */
  fullWidth?: boolean;
}) {
  const location = useLocation();
  const { data: user } = useAuth();

  const tabs = TABS;

  return (
    <div className={`aa-settings-hub${fullWidth ? " aa-settings-hub--full" : ""}`}>
      <Link className="aa-settings-back" to="/app">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Next
      </Link>

      <h1 className="aa-settings-h">Settings</h1>

      <nav className="aa-settings-tabs" aria-label="Settings">
        {tabs.map((tab) => {
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
