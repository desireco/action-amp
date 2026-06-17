import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth, logout } from "wasp/client/auth";
import {
  BrandMark,
  LensSwitch,
  NavItem,
  PlusIcon,
  MoonIcon,
  StarIcon,
  InboxIcon,
  ClockIcon,
  CalendarIcon,
  SomedayIcon,
  ProjectsIcon,
  GoalsIcon,
  LogbookIcon,
  UserIcon,
} from "../components/ui";
import "./AppShell.css";

/**
 * Authenticated app shell — the persistent chrome framing every /app page.
 *
 * Matches app-shell-whatnow.html prototype:
 *   - Sidebar: brand, Lens switch (Work/Me), grouped nav with icons + counts +
 *     active bar, user footer.
 *   - Topbar: Capture (⌘K) + theme toggle.
 *
 * Wasp 0.24 has no layout route wrapper, so every /app page renders this.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useAuth();
  const location = useLocation();
  const [lens, setLens] = useState<"work" | "me">("work");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const isActive = (to: string) =>
    to === "/app" ? location.pathname === "/app" : location.pathname.startsWith(to);

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "";

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  };

  return (
    <div className="aa-app">
      {/* ============================ SIDEBAR ============================ */}
      <aside className="aa-app-side">
        <Link className="aa-app-brand" to="/">
          <span className="aa-app-mark" aria-hidden="true">
            <BrandMark size="sm" />
          </span>
          <span className="aa-app-brand-name">ActionAmp</span>
        </Link>

        <LensSwitch
          options={[
            { id: "work", label: "Work" },
            { id: "me", label: "Me" },
          ]}
          active={lens}
          onSelect={(id) => setLens(id as "work" | "me")}
          className="aa-app-lens"
        />

        {/* Section 1 — focus */}
        <nav className="aa-app-nav">
          <NavItem
            icon={<StarIcon />}
            label="What Now"
            active={isActive("/app")}
            to="/app"
          />
          <NavItem
            icon={<InboxIcon />}
            label="Inbox"
            active={isActive("/app/inbox")}
            to="/app/inbox"
            count={4}
            countVariant="urgent"
          />
          <NavItem icon={<ClockIcon />} label="Today" soon count={3} />
          <NavItem icon={<CalendarIcon />} label="Upcoming" soon />
          <NavItem icon={<SomedayIcon />} label="Someday" soon />
        </nav>

        {/* Section 2 — structure */}
        <nav className="aa-app-nav">
          <NavItem icon={<ProjectsIcon />} label="Projects" soon count={6} />
          <NavItem icon={<GoalsIcon />} label="Goals" soon count={3} />
        </nav>

        {/* Section 3 — history */}
        <nav className="aa-app-nav">
          <NavItem icon={<LogbookIcon />} label="Logbook" soon />
        </nav>

        {/* User footer */}
        <div className="aa-app-user">
          <Link
            to="/app/settings"
            className={`aa-app-user-btn ${isActive("/app/settings") ? "active" : ""}`}
            title="Settings"
          >
            <span className="aa-app-user-avatar" aria-hidden="true">{initials || <UserIcon />}</span>
            <span className="aa-app-user-name">
              {user ? `${user.firstName} ${user.lastName}`.trim() : ""}
            </span>
          </Link>
          <button type="button" className="aa-app-logout" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </aside>

      {/* ============================ MAIN ============================ */}
      <div className="aa-app-mainwrap">
        {/* ---- Topbar ---- */}
        <header className="aa-app-topbar">
          <div className="aa-app-topbar-actions">
            <button type="button" className="aa-app-kbd-btn" title="Capture (⌘K)">
              <PlusIcon width={14} height={14} />
              <span>Capture</span>
              <kbd className="aa-app-kbd">⌘K</kbd>
            </button>
            <button
              type="button"
              className="aa-app-icon-btn"
              onClick={toggleTheme}
              title="Toggle theme (⌘D)"
              aria-label="Toggle theme"
            >
              {theme === "light" ? <MoonIcon /> : "☀"}
            </button>
          </div>
        </header>

        {/* ---- Page content ---- */}
        <main className="aa-app-main">{children}</main>
      </div>
    </div>
  );
}
