import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth, logout } from "wasp/client/auth";
import { useQuery, ensureOnboarded, getAppData, createInboxItem } from "wasp/client/operations";
import { LensContext } from "./lensContext";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { CapturePopover, ShortcutCheatsheet } from "../components/ui";
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
  const navigate = useNavigate();
  const [lens, setLensState] = useState<string>(() => {
    if (typeof window === "undefined") return "Work";
    return localStorage.getItem("aa-lens") ?? "Work";
  });
  const setLens = (name: string) => {
    setLensState(name);
    localStorage.setItem("aa-lens", name);
  };
  // Theme: persisted to localStorage, kept in sync with the Preferences page.
  // Reads once on mount; falls back to the system preference on first visit.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("aa-theme") as "light" | "dark" | null;
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  // Apply the theme to <html> whenever it changes (initial mount + toggles).
  // The useState initializer reads before paint; this effect commits the
  // data-theme attribute so the dark tokens activate.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Idempotent: ensures the user has the default Work/Me lenses (covers both
  // existing users and new signups). Runs once per app load — but ONLY when
  // authenticated, so the /login redirect path doesn't 500 these ops.
  useEffect(() => {
    if (user) ensureOnboarded();
  }, [user, ensureOnboarded]);

  // Shell data: lenses (sidebar switch + query scoping) + nav counts.
  // Disabled until authenticated (avoids 'Not authenticated' 500s on the
  // pre-auth render while Wasp resolves the session).
  const { data: appData } = useQuery(getAppData, undefined, { enabled: !!user });
  const lenses = appData?.lenses ?? [];
  const counts = appData?.counts ?? { inbox: 0, today: 0, projects: 0, goals: 0 };

  // Keep the active lens valid once lenses load; default to the first.
  // If the stored name no longer matches (e.g. renamed), self-heal: persist
  // the fallback so we don't keep looking up a stale name.
  const activeLens = lenses.find((l) => l.name === lens) ?? lenses[0];
  const activeLensName = activeLens?.name ?? lens;
  useEffect(() => {
    if (activeLens && activeLens.name !== lens) {
      setLens(activeLens.name);
    }
  }, [activeLens, lens]);
  // The value pages consume via useActiveLens() to scope their queries.
  const activeLensValue = activeLens ? { id: activeLens.id, name: activeLens.name } : null;

  const isActive = (to: string) =>
    to === "/app" ? location.pathname === "/app" : location.pathname.startsWith(to);

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "";

  // ---- Overlays (capture popover, shortcut cheatsheet) ----
  // Focus mode is page-scoped (set by a task's onOpen), so it lives in pages,
  // not the shell. Esc closes whichever overlay is open.
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useKeyboardShortcuts({
    onCapture: () => setCaptureOpen(true),
    onGoHome: () => navigate("/app"),
    onToggleCheatsheet: () => setCheatsheetOpen((v) => !v),
    onCloseOverlay: () => {
      setCaptureOpen(false);
      setCheatsheetOpen(false);
    },
  });

  // Lock body scroll while any overlay is open.
  useEffect(() => {
    const open = captureOpen || cheatsheetOpen;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [captureOpen, cheatsheetOpen]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("aa-theme", next);
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
          options={lenses.length > 0 ? lenses.map((l) => ({ id: l.name, label: l.name })) : [{ id: "Work", label: "Work" }, { id: "Me", label: "Me" }]}
          active={activeLensName}
          onSelect={(id) => setLens(id)}
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
            count={counts.inbox}
            countVariant="urgent"
          />
          <NavItem icon={<ClockIcon />} label="Today" active={isActive("/app/today")} to="/app/today" count={counts.today} />
          <NavItem icon={<CalendarIcon />} label="Upcoming" active={isActive("/app/upcoming")} to="/app/upcoming" />
          <NavItem icon={<SomedayIcon />} label="Someday" active={isActive("/app/someday")} to="/app/someday" />
        </nav>

        {/* Section 2 — structure */}
        <nav className="aa-app-nav">
          <NavItem icon={<ProjectsIcon />} label="Projects" active={isActive("/app/projects")} to="/app/projects" count={counts.projects} />
          <NavItem icon={<GoalsIcon />} label="Goals" active={isActive("/app/goals")} to="/app/goals" count={counts.goals} />
        </nav>

        {/* Section 3 — history */}
        <nav className="aa-app-nav">
          <NavItem icon={<LogbookIcon />} label="Logbook" active={isActive("/app/logbook")} to="/app/logbook" />
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
            <button type="button" className="aa-app-kbd-btn" title="Capture (⌘/)" onClick={() => setCaptureOpen(true)}>
              <PlusIcon width={14} height={14} />
              <span>Capture</span>
              <kbd className="aa-app-kbd">⌘/</kbd>
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
        <main className="aa-app-main">
          <LensContext.Provider value={activeLensValue}>
            {children}
          </LensContext.Provider>
        </main>
      </div>

      {/* ---- Global overlays (capture popover + shortcut cheatsheet) ---- */}
      {captureOpen && (
        <CapturePopover
          onClose={() => setCaptureOpen(false)}
          onSubmit={async (text) => {
            await createInboxItem({ text });
          }}
        />
      )}
      {cheatsheetOpen && <ShortcutCheatsheet onClose={() => setCheatsheetOpen(false)} />}
    </div>
  );
}
