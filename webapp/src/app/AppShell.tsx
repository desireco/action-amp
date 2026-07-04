import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth, logout } from "wasp/client/auth";
import { useQuery, ensureOnboarded, getAppData, createInboxItem, submitFeedback } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { LensContext } from "./lensContext";
import { useKeyboardShortcuts, type NavDestination } from "./useKeyboardShortcuts";
import { FeedbackDialog } from "./FeedbackDialog";
import { CapturePopover, ShortcutCheatsheet, ConfirmDialog, ProGate, LensChip, LensPopover } from "../components/ui";
import { useEntitled } from "../billing/useEntitled";
import {
  BrandMark,
  LensSwitch,
  NavItem,
  PlusIcon,
  LoudspeakerIcon,
  StarIcon,
  InboxIcon,
  ClockIcon,
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
 * Sidebar structure (WORKFLOW.md):
 *   - Brand + Lens switch (context — Work/Me, always available)
 *   - Inbox (universal — always visible, capture destination)
 *   - Focus nav: three expanding sections (Work / Plan / Review), one open
n *     at a time. Expanding one collapses the others.
 *   - User footer
 *
 * Capture is a lower-right floating action, pervasive across all modes.
 */

type FocusSection = "work" | "plan" | "review";

/** Routes for the Shift-letter navigation chords (useKeyboardShortcuts). */
const NAV_ROUTE: Record<NavDestination, string> = {
  inbox: "/app/inbox",
  next: "/app",
  today: "/app/today",
  triage: "/app/inbox/review",
  planning: "/app/projects",
  review: "/app/logbook",
};

function sectionForPath(pathname: string): FocusSection {
  if (pathname === "/app" || pathname.startsWith("/app/today")) return "work";
  if (pathname.startsWith("/app/projects") || pathname.startsWith("/app/goals") || pathname.startsWith("/app/someday")) return "plan";
  if (pathname.startsWith("/app/logbook")) return "review";
  return "work";
}
export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Entitlement: FREE users may only use the Me lens. The Work lens is
  // "visible-but-locked" — they see it in the switch, but selecting it shows a
  // <ProGate> instead of switching (the friendly surface). The server guard is
  // the boundary; this is the UX.
  const entitled = useEntitled();
  const [workGated, setWorkGated] = useState(false);
  const [lens, setLensState] = useState<string>(() => {
    if (typeof window === "undefined") return "Me";
    return localStorage.getItem("aa-lens") ?? "Me";
  });
  const setLens = (name: string) => {
    // FREE user clicking the Work lens: don't switch (their queries would 402
    // server-side anyway); show the ProGate in the main area instead. Stay on
    // the Me lens so the sidebar/data behind the gate stays valid.
    if (!entitled && name === "Work") {
      setWorkGated(true);
      return;
    }
    setWorkGated(false);
    setLensState(name);
    localStorage.setItem("aa-lens", name);
  };
  // Theme is controlled from Settings > Preferences. The shell only applies the
  // persisted/system value on app entry so the tokens are active before a
  // settings page is visited.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("aa-theme") as "light" | "dark" | null;
    const theme = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  }, []);

  // Idempotent: ensures the user has the default Work/Me lenses (covers both
  // existing users and new signups). Runs once per app load — but ONLY when
  // authenticated, so the /login redirect path doesn't 500 these ops.
  // Guarded by a ref: React StrictMode (or a fast remount) double-fires effects
  // in dev, and ensureOnboarded's first-run task seed is check-then-create
  // (not atomic) — a double-fire could seed two "Try it" tasks. The ref ensures
  // we fire once per user session; the count===0 guard inside handles across
  // logins. Production (no StrictMode) is unaffected.
  const onboardedFor = useRef<string | null>(null);
  useEffect(() => {
    if (user && onboardedFor.current !== user.id) {
      onboardedFor.current = user.id;
      ensureOnboarded();
    }
  }, [user, ensureOnboarded]);

  // Shell data: lenses (sidebar switch + query scoping) + nav counts. Counts
  // are scoped to the active lens so the badges match each list page. We pass
  // the lens *name* (the only thing known before lenses load — it's in
  // localStorage); getAppData resolves name→id server-side. Disabled until
  // authenticated (avoids 'Not authenticated' 500s on the pre-auth render
  // while Wasp resolves the session).
  const { data: appData } = useQuery(
    getAppData,
    { lensName: lens },
    { enabled: !!user },
  );
  const lenses = appData?.lenses ?? [];
  const counts = appData?.counts ?? { inbox: 0, today: 0, projects: 0, goals: 0 };
  const todayByLens = appData?.todayByLens ?? {};
  // The Work lens is "visible-but-locked" for FREE users: shown in the switch
  // with a tiny "Pro" affordance (proLocked), but selecting it shows the gate.
  // proLocked now branches on kind (WORK/PERSONAL), not the name — rename-safe.
  const workLocked = !entitled;
  const lensOptions =
    lenses.length > 0
      ? lenses.map((l) => ({
          id: l.name,
          label: l.name,
          color: l.color ?? undefined,
          count: todayByLens[l.id] ?? 0,
          purpose: l.purpose ?? undefined,
          // FREE: only PERSONAL is usable; WORK + CUSTOM are gated.
          proLocked: workLocked && l.kind !== "PERSONAL",
        }))
      : [
          { id: "Work", label: "Work", color: "indigo", count: 0, purpose: undefined, proLocked: workLocked },
          { id: "Me", label: "Me", color: "emerald", count: 0, purpose: undefined, proLocked: false },
        ];
  // Adaptive switcher: ≤3 lenses → segmented control (today); ≥4 → chip + popover.
  // The swap is pure presentational state on lens count, no routing change.
  const usePopover = lensOptions.length >= 4;

  // Keep the active lens valid once lenses load; default to the first.
  // If the stored name no longer matches (e.g. renamed), self-heal: persist
  // the fallback so we don't keep looking up a stale name.
  //
  // Entitlement clamp: a FREE user must never resolve to a non-PERSONAL lens —
  // a stored `aa-lens=Work` (a bypass attempt, or stale from a lapsed plan)
  // would otherwise scope their queries to Work and 402 server-side. Fall back
  // to PERSONAL so the client never asks for data it isn't entitled to. Branches
  // on KIND (rename-safe): a renamed Work lens is still kind=WORK, still gated.
  // The server guard is the boundary; this prevents the broken UX of every
  // query erroring on load.
  const resolvedLens = lenses.find((l) => l.name === lens) ?? lenses[0];
  const activeLens =
    !entitled && resolvedLens && resolvedLens.kind !== "PERSONAL"
      ? lenses.find((l) => l.kind === "PERSONAL") ?? resolvedLens
      : resolvedLens;
  const activeLensName = activeLens?.name ?? lens;
  useEffect(() => {
    if (activeLens && activeLens.name !== lens) {
      setLensState(activeLens.name);
      localStorage.setItem("aa-lens", activeLens.name);
      setWorkGated(false);
    }
  }, [activeLens, lens]);
  // The value pages consume via useActiveLens() to scope their queries.
  const activeLensValue = activeLens
    ? { id: activeLens.id, name: activeLens.name, color: activeLens.color ?? null }
    : null;

  // Mirror the active lens's identity color onto <html data-lens="..."> so CSS
  // can apply the per-lens palette globally (background wash, sidebar tint, nav
  // rail, card accent, triage step). Falls back to "indigo" (the :root default)
  // for unknown/null — see styles/tokens.css. Identity only, never system/state.
  //
  // Deps on the color KEY (a primitive string), not the activeLens object: the
  // query cache may return a referentially-equal object across a switch before
  // the refetch lands, which would skip the effect. Keying on the primitive
  // guarantees it fires the instant the selection changes.
  const activeLensColor = activeLens?.color || "indigo";
  useEffect(() => {
    document.documentElement.dataset.lens = activeLensColor;
  }, [activeLensColor]);

  const isActive = (to: string) =>
    to === "/app" ? location.pathname === "/app" : location.pathname.startsWith(to);

  // ponytail: 1–2 letter initials from fullName (first + last token). Good enough for an avatar.
  const initials = user
    ? user.fullName.split(/\s+/).map((s) => s[0] ?? "").slice(0, 2).join("").toUpperCase()
    : "";

  // ---- Focus nav: which section is expanded (one at a time) ----
  // Auto-switches when the user navigates to a page in a different section.
  const [expandedFocus, setExpandedFocus] = useState<FocusSection>(() =>
    typeof window === "undefined"
      ? "work"
      : (localStorage.getItem("aa-focus") as FocusSection) ?? sectionForPath(location.pathname),
  );
  // Sync with route changes (e.g. clicking a nav item, browser back/forward).
  useEffect(() => {
    setExpandedFocus(sectionForPath(location.pathname));
  }, [location.pathname]);

  const handleSetFocus = (s: FocusSection) => {
    setExpandedFocus(s);
    localStorage.setItem("aa-focus", s);
  };

  // ---- Overlays (capture popover, shortcut cheatsheet) ----
  // Focus mode is page-scoped (set by a task's onOpen), so it lives in pages,
  // not the shell. Esc closes whichever overlay is open.
  const [captureOpen, setCaptureOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [mobileLensOpen, setMobileLensOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lensPopoverOpen, setLensPopoverOpen] = useState(false);

  useKeyboardShortcuts({
    onCapture: () => setCaptureOpen(true),
    onGoHome: () => navigate("/app"),
    onNavigate: (dest) => navigate(NAV_ROUTE[dest]),
    onToggleCheatsheet: () => setCheatsheetOpen((v) => !v),
    onToggleLens: () => setLensPopoverOpen((v) => !v),
    onCloseOverlay: () => {
      setCaptureOpen(false);
      setCheatsheetOpen(false);
      setConfirmLogout(false);
      setMobileLensOpen(false);
      setFeedbackOpen(false);
      setLensPopoverOpen(false);
    },
  });

  // Lock body scroll while any overlay is open.
  useEffect(() => {
    const open = captureOpen || cheatsheetOpen || confirmLogout || feedbackOpen;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [captureOpen, cheatsheetOpen, confirmLogout, feedbackOpen]);

  return (
    <div className="aa-app">
      {/* ============================ SIDEBAR ============================ */}
      <aside className="aa-app-side">
        <Link className="aa-app-brand" to="/app" title="Next">
          <span className="aa-app-mark" aria-hidden="true">
            <BrandMark size="sm" />
          </span>
          <span className="aa-app-brand-name">ActionAmp</span>
        </Link>

        {/* ---- Inbox (universal — always visible, capture destination) ---- */}
        <nav className="aa-app-nav">
          <NavItem
            icon={<InboxIcon />}
            label="Inbox"
            active={isActive("/app/inbox")}
            to="/app/inbox"
            count={counts.inbox > 0 ? counts.inbox : (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-label="Inbox zero">
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            countVariant={counts.inbox > 0 ? "urgent" : "done"}
          />
        </nav>

        {/* ---- Focus nav: expanding sections, one open at a time ---- */}
        <nav className="aa-focus-nav">
          {/* Work */}
          <div className={`aa-focus-section ${expandedFocus === "work" ? "open" : ""}`}>
            <button
              type="button"
              className="aa-focus-header"
              onClick={() => handleSetFocus("work")}
              aria-expanded={expandedFocus === "work"}
            >
              Work
            </button>
            {expandedFocus === "work" && (
              <div className="aa-focus-items">
                <NavItem icon={<StarIcon />} label="Next" active={isActive("/app")} to="/app" />
                <NavItem icon={<ClockIcon />} label="Today" active={isActive("/app/today")} to="/app/today" count={counts.today} />
              </div>
            )}
          </div>

          {/* Plan */}
          <div className={`aa-focus-section ${expandedFocus === "plan" ? "open" : ""}`}>
            <button
              type="button"
              className="aa-focus-header"
              onClick={() => handleSetFocus("plan")}
              aria-expanded={expandedFocus === "plan"}
            >
              Plan
            </button>
            {expandedFocus === "plan" && (
              <div className="aa-focus-items">
                <NavItem icon={<ProjectsIcon />} label="Projects" active={isActive("/app/projects")} to="/app/projects" count={counts.projects} />
                <NavItem icon={<GoalsIcon />} label="Goals" active={isActive("/app/goals")} to="/app/goals" count={counts.goals} />
                <NavItem icon={<SomedayIcon />} label="Someday" active={isActive("/app/someday")} to="/app/someday" />
              </div>
            )}
          </div>

          {/* Review */}
          <div className={`aa-focus-section ${expandedFocus === "review" ? "open" : ""}`}>
            <button
              type="button"
              className="aa-focus-header"
              onClick={() => handleSetFocus("review")}
              aria-expanded={expandedFocus === "review"}
            >
              Review
            </button>
            {expandedFocus === "review" && (
              <div className="aa-focus-items">
                <NavItem icon={<LogbookIcon />} label="Logbook" active={isActive("/app/logbook")} to="/app/logbook" />
              </div>
            )}
          </div>
        </nav>

        {/* User footer */}
        <div className="aa-app-user">
          {/* Adaptive lens switcher: segmented control at ≤3 lenses (today,
              unchanged), chip + popover at ≥4 (when segmented gets crowded).
              ⌘L toggles the popover; the wrapper is positioned relative so the
              popover anchors under the chip. */}
          <div className="aa-app-lens">
            {usePopover ? (
              <>
                <LensChip
                  label={activeLensName}
                  color={activeLens?.color ?? undefined}
                  open={lensPopoverOpen}
                  onClick={() => setLensPopoverOpen((v) => !v)}
                />
                {lensPopoverOpen && (
                  <LensPopover
                    options={lensOptions}
                    active={activeLensName}
                    onSelect={(id) => setLens(id)}
                    onClose={() => setLensPopoverOpen(false)}
                    onNewLens={entitled ? () => navigate("/app/settings/lenses") : undefined}
                    newLensProLocked={!entitled}
                  />
                )}
              </>
            ) : (
              <LensSwitch
                options={lensOptions}
                active={activeLensName}
                onSelect={(id) => setLens(id)}
              />
            )}
          </div>
          <Link
            to="/app/settings"
            className={`aa-app-user-btn ${isActive("/app/settings") ? "active" : ""}`}
            title="Settings"
          >
            <span className="aa-app-user-avatar" aria-hidden="true">{initials || <UserIcon />}</span>
            <span className="aa-app-user-name">
              {user ? user.fullName : ""}
            </span>
          </Link>
          <button type="button" className="aa-app-logout" onClick={() => setConfirmLogout(true)}>
            Log out
          </button>
        </div>
      </aside>

      {/* ============================ MAIN ============================ */}
      <div className="aa-app-mainwrap">
        {/* ---- Page content ---- */}
        <main className="aa-app-main">
          <LensContext.Provider value={activeLensValue}>
            {/* Work-lens gate: a FREE user clicking Work sees the ProGate in the
             * main area instead of Work content. The lens isn't switched (setLens
             * bails), so the Me lens stays active behind the gate. */}
            {workGated ? (
              <ProGate
                feature="the Work lens"
                reason="bring your work life into ActionAmp"
                className="aa-app-gate"
              />
            ) : (
              children
            )}
          </LensContext.Provider>
        </main>
      </div>

      <nav className={`aa-mobile-dock ${mobileLensOpen ? "is-lens-open" : ""}`} aria-label="Mobile navigation">
        {mobileLensOpen && (
          <div className="aa-mobile-lens-menu" role="menu" aria-label="Choose Lens">
            {lensOptions.map((l) => (
              <button
                key={l.id}
                type="button"
                role="menuitemradio"
                aria-checked={l.id === activeLensName}
                className={`aa-mobile-lens-menu__item ${l.id === activeLensName ? "active" : ""}`}
                data-lens-color={l.color}
                onClick={() => {
                  setLens(l.id);
                  setMobileLensOpen(false);
                }}
              >
                <span className="aa-mobile-lens-menu__dot" aria-hidden="true" />
                <span>{l.label}</span>
                {(l.count ?? 0) > 0 && <span className="aa-mobile-lens-menu__count">{l.count}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="aa-mobile-dock__row">
          <Link className={`aa-mobile-dock__item ${isActive("/app") ? "active" : ""}`} to="/app" aria-label="Next">
            <StarIcon />
            <span>Next</span>
          </Link>
          <Link className={`aa-mobile-dock__item ${isActive("/app/inbox") ? "active" : ""}`} to="/app/inbox" aria-label="Inbox">
            <InboxIcon />
            <span>Inbox</span>
          </Link>
          <Link className={`aa-mobile-dock__item ${isActive("/app/today") ? "active" : ""}`} to="/app/today" aria-label="Today">
            <ClockIcon />
            <span>Today</span>
          </Link>
          <Link className={`aa-mobile-dock__item ${expandedFocus === "plan" ? "active" : ""}`} to="/app/projects" aria-label="Plan">
            <ProjectsIcon />
            <span>Plan</span>
          </Link>
          <Link className={`aa-mobile-dock__item ${expandedFocus === "review" ? "active" : ""}`} to="/app/logbook" aria-label="Review">
            <LogbookIcon />
            <span>Review</span>
          </Link>
          <button
            type="button"
            className={`aa-mobile-dock__item aa-mobile-dock__lens-btn ${mobileLensOpen ? "active" : ""}`}
            aria-label={`Lens: ${activeLensName}`}
            aria-expanded={mobileLensOpen}
            onClick={() => setMobileLensOpen((v) => !v)}
          >
            <span className="aa-mobile-dock__lens-dot" aria-hidden="true" />
            <span>{activeLensName}</span>
          </button>
        </div>
      </nav>

      <div className="aa-app-utility-cluster" aria-label="Shell utilities">
        <button
          type="button"
          className="aa-app-utility-btn"
          onClick={() => setFeedbackOpen(true)}
          title="Leave feedback"
          aria-label="Leave feedback"
        >
          <LoudspeakerIcon />
        </button>
        <button
          type="button"
          className="aa-app-utility-btn"
          onClick={() => setCheatsheetOpen(true)}
          title="Shortcuts (?)"
          aria-label="Shortcuts"
        >
          ?
        </button>
      </div>

      <button
        type="button"
        className={`aa-app-capture-fab ${mobileLensOpen ? "is-hidden-while-lens-open" : ""}`}
        title="Capture (⌘K)"
        aria-label="Capture"
        onClick={() => setCaptureOpen(true)}
      >
        <PlusIcon width={18} height={18} />
        <span>Capture</span>
        <kbd>⌘K</kbd>
      </button>

      {/* ---- Global overlays (capture popover + shortcut cheatsheet) ---- */}
      {captureOpen && (
        <CapturePopover
          onClose={() => setCaptureOpen(false)}
          onSubmit={async (text) => {
            // Belt-and-suspenders: the App.tsx gate should make this
            // unreachable without a user, but never fire an auth-required
            // action unauthenticated (the original "Not authenticated" 500).
            if (!user) return;
            await createInboxItem({ text });
            // Invalidate the inbox list + the sidebar counts so both refresh.
            // Without this, React Query serves the stale pre-capture cache
            // and the new item doesn't appear until a manual reload.
            queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
            queryClient.invalidateQueries({ queryKey: ["getAppData"] });
          }}
        />
      )}
      {cheatsheetOpen && <ShortcutCheatsheet onClose={() => setCheatsheetOpen(false)} />}
      {feedbackOpen && (
        <FeedbackDialog
          onClose={() => setFeedbackOpen(false)}
          onSubmit={async (message) => {
            await submitFeedback({
              message,
              route: `${location.pathname}${location.search}`,
              section: expandedFocus,
              lens: activeLensValue,
              userAgent: typeof window === "undefined" ? null : window.navigator.userAgent,
            });
          }}
        />
      )}
      {confirmLogout && (
        <ConfirmDialog
          title="Log out?"
          message="You'll be signed out and return to the home page."
          confirmLabel="Log out"
          cancelLabel="Stay"
          danger
          onConfirm={async () => {
            await logout();
            navigate("/");
          }}
          onClose={() => setConfirmLogout(false)}
        />
      )}
    </div>
  );
}
