import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth, logout } from "wasp/client/auth";
import { useQuery, ensureOnboarded, getAppData, createInboxItem, submitFeedback, getProjectsForResolver } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { LensContext } from "./lensContext";
import { useKeyboardShortcuts, type NavDestination } from "./useKeyboardShortcuts";
import { FeedbackDialog } from "./FeedbackDialog";
import { CapturePopover, ShortcutCheatsheet, ConfirmDialog, ProGate, LensChip, LensPopover, Kbd } from "../components/ui";
import { useEntitled } from "../billing/useEntitled";
import { registerServiceWorker } from "../notifications/client";
import {
  BrandMark,
  LensSwitch,
  NavItem,
  PlusIcon,
  LoudspeakerIcon,
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
  if (pathname.startsWith("/app/upcoming") || pathname.startsWith("/app/projects") || pathname.startsWith("/app/goals") || pathname.startsWith("/app/someday")) return "plan";
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
  // Active lens state, keyed by lens ID (the stable handle). Previously this
  // was keyed by name (localStorage "aa-lens"); id-keying is the rename-safety
  // fix — renaming the active lens no longer resets it on reload. The one-shot
  // migration below reads the old name-keyed value and rewrites to "aa-lens-id".
  // Sentinel `name:<x>` marks a not-yet-resolved migrated value (resolved once
  // lenses load); null = no stored preference (defaults to first lens).
  const [lensId, setLensIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const id = localStorage.getItem("aa-lens-id");
    if (id) return id;
    const oldName = localStorage.getItem("aa-lens");
    return oldName ? `name:${oldName}` : null;
  });
  // setLens is assigned in the render below (after `lenses` loads) so the FREE
  // gate can branch on the selected lens's kind, not its name. The forward decl
  // keeps the call sites stable.
  const setLens = (id: string) => {
    setLensIdState(id);
    localStorage.setItem("aa-lens-id", id);
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

  // Push and notification actions are handled by the production service worker.
  // Register once at shell mount; the worker never caches account data.
  useEffect(() => {
    registerServiceWorker();
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

  // Shell data: lenses (sidebar switch + query scoping) + nav counts. The query
  // takes the active lens ID directly (id-keyed, like the rest of the state) —
  // switching lenses changes the query arg → React Query refetches → the focus-
  // nav badges (Today/Projects/Goals) re-scope to the new lens. Before lenses
  // load, lensId may be a `name:<x>` migration sentinel; getAppData ignores ids
  // it can't resolve and falls back to the first lens.
  const rawId = lensId && !lensId.startsWith("name:") ? lensId : null;
  const { data: appData } = useQuery(
    getAppData,
    { lensId: rawId },
    { enabled: !!user },
  );
  const lenses = appData?.lenses ?? [];
  const counts = appData?.counts ?? {
    inbox: 0,
    today: 0,
    upcoming: 0,
    someday: 0,
    open: 0,
    projects: 0,
    goals: 0,
  };
  const todayByLens = appData?.todayByLens ?? {};

  // Capture autocomplete sources — fetched here (gated on user, same as
  // getAppData) and passed as props to CapturePopover so the popover stays a
  // pure-UI component with no queries/auth of its own. CapturePopover renders
  // outside the LensContext provider, so making it do its own queries was racy
  // (auth not resolved at mount → 500s). One query site, one auth gate.
  const { data: resolverProjects } = useQuery(getProjectsForResolver, undefined, {
    enabled: !!user,
  });
  // Lens names for the [[ ]] parser — seeded (work/personal/me) are always
  // known to the parser; custom names must be supplied.
  const customLensNames = lenses
    .filter((l) => l.kind === "CUSTOM")
    .map((l) => l.name);

  // One-shot migration: resolve a `name:X` sentinel to a real lens id once the
  // lenses load, persist under the new key, and delete the old name key. After
  // this runs once, lensId is a real id and the sentinel is gone.
  useEffect(() => {
    if (!lensId?.startsWith("name:") || lenses.length === 0) return;
    const oldName = lensId.slice(5);
    const resolved = lenses.find((l) => l.name === oldName) ?? lenses[0];
    if (resolved) {
      setLensIdState(resolved.id);
      localStorage.setItem("aa-lens-id", resolved.id);
      localStorage.removeItem("aa-lens");
    }
  }, [lensId, lenses]);

  // Resolve the active lens from the stored id (or the sentinel name). Falls
  // back to the first lens if the id is stale/missing. Entitlement clamp: a
  // FREE user must never resolve to a non-PERSONAL lens — a stored id pointing
  // at WORK/CUSTOM (a bypass attempt, or stale from a lapsed plan) falls back to
  // PERSONAL so their queries don't 402. Branches on KIND (rename-safe). The
  // server guard is the boundary; this prevents the broken UX of every query
  // erroring on load.
  const resolvedLens =
    (rawId ? lenses.find((l) => l.id === rawId) : undefined) ?? lenses[0];
  const activeLens =
    !entitled && resolvedLens && resolvedLens.kind !== "PERSONAL"
      ? lenses.find((l) => l.kind === "PERSONAL") ?? resolvedLens
      : resolvedLens;
  const activeLensName = activeLens?.name ?? "Me";
  // Self-heal: if the stored id no longer matches a lens (deleted?), persist
  // the fallback so we don't keep looking up a stale id.
  useEffect(() => {
    if (activeLens && activeLens.id !== lensId) {
      setLensIdState(activeLens.id);
      localStorage.setItem("aa-lens-id", activeLens.id);
      setWorkGated(false);
    }
  }, [activeLens, lensId]);

  // The Work lens is "visible-but-locked" for FREE users: shown in the switch
  // with a tiny "Pro" affordance (proLocked), but selecting it shows the gate.
  // proLocked branches on kind (WORK/PERSONAL/CUSTOM), not the name — rename-safe.
  // The option id is the real lens id (so onSelect carries the id to setLens).
  const workLocked = !entitled;
  const lensOptions =
    lenses.length > 0
      ? lenses.map((l) => ({
          id: l.id,
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

  // Select handler with FREE gating: a non-entitled user picking a non-PERSONAL
  // lens sees the ProGate in the main area instead of switching (their queries
  // would 402 server-side anyway). Stays on the current lens so the data behind
  // the gate stays valid. Branches on KIND, not name — rename-safe.
  const selectLens = (id: string) => {
    const target = lenses.find((l) => l.id === id);
    if (!entitled && target && target.kind !== "PERSONAL") {
      setWorkGated(true);
      return;
    }
    setWorkGated(false);
    setLens(id);
  };

  // The value pages consume via useActiveLens() to scope their queries.
  const activeLensValue = activeLens
    ? { id: activeLens.id, name: activeLens.name, color: activeLens.color ?? null, kind: activeLens.kind, purpose: activeLens.purpose }
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

  // Manifest shortcut and notification action: /app?capture=1 opens the same
  // universal capture surface as ⌘K, then removes the one-shot URL flag.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("capture") !== "1") return;
    setCaptureOpen(true);
    const params = new URLSearchParams(location.search);
    params.delete("capture");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" }, { replace: true });
  }, [location.pathname, location.search, navigate]);

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

  // On mobile, hide the bottom dock while in Settings or Focus mode. Settings
  // is a deliberate detour from the focus loop (its tabs are all inactive
  // there); Focus is a full-screen modal where the dock actively overlaps the
  // keyboard-rail hints. In both, reclaiming the thumb zone helps and the FAB
  // stays for capture. Desktop is unaffected (the dock is already display:none
  // above 768px).
  const inSettings = isActive("/app/settings");
  const inFocus = location.pathname.startsWith("/app/focus");

  return (
    <div
      className={`aa-app${inSettings ? " is-in-settings" : ""}${inFocus ? " is-in-focus" : ""}`}
    >
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
                <NavItem icon={<CalendarIcon />} label="Upcoming" active={isActive("/app/upcoming")} to="/app/upcoming" count={counts.upcoming} />
                <NavItem icon={<ProjectsIcon />} label="Projects" active={isActive("/app/projects")} to="/app/projects" count={counts.projects} />
                <NavItem icon={<GoalsIcon />} label="Goals" active={isActive("/app/goals")} to="/app/goals" count={counts.goals} />
                <NavItem icon={<SomedayIcon />} label="Someday" active={isActive("/app/someday")} to="/app/someday" count={counts.someday} />
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
                    active={activeLens?.id ?? ""}
                    onSelect={selectLens}
                    onClose={() => setLensPopoverOpen(false)}
                    onNewLens={entitled ? () => navigate("/app/settings/lenses") : undefined}
                    newLensProLocked={!entitled}
                  />
                )}
              </>
            ) : (
              <LensSwitch
                options={lensOptions}
                active={activeLens?.id ?? ""}
                onSelect={selectLens}
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
                aria-checked={l.id === activeLens?.id}
                className={`aa-mobile-lens-menu__item ${l.id === activeLens?.id ? "active" : ""}`}
                data-lens-color={l.color}
                onClick={() => {
                  selectLens(l.id);
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
          {/* Mobile dock: "Do" is the Next/What-Now chooser (the home screen).
              "Today" leaves the dock (its slot is covered by a Today link on
              the Next page, plus the Today↔Upcoming cross-link). Desktop keeps
              the full Next/Today sidebar split. */}
          <Link className={`aa-mobile-dock__item ${isActive("/app/inbox") ? "active" : ""}`} to="/app/inbox" aria-label="Inbox">
            <InboxIcon />
            <span>Inbox</span>
          </Link>
          <Link className={`aa-mobile-dock__item ${isActive("/app") ? "active" : ""}`} to="/app" aria-label="Do">
            <StarIcon />
            <span>Do</span>
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
        {/* Shortcuts (?) — keyboard-only; hidden on touch (see AppShell.css).
            Desktop utility cluster order (right→left): shortcuts, feedback,
            avatar/settings. The feedback + shortcuts buttons precede the avatar
            in the DOM so they sit to its left when the cluster is pinned right. */}
        <button
          type="button"
          className="aa-app-utility-btn aa-app-shortcuts-btn"
          onClick={() => setCheatsheetOpen(true)}
          title="Shortcuts (?)"
          aria-label="Shortcuts"
        >
          ?
        </button>
        <button
          type="button"
          className="aa-app-utility-btn"
          onClick={() => setFeedbackOpen(true)}
          title="Leave feedback"
          aria-label="Leave feedback"
        >
          <LoudspeakerIcon />
        </button>
        {/* Mobile-only avatar → Settings. The sidebar footer that hosts the
            desktop avatar/settings link is display:none at ≤768px, and the
            bottom dock has no settings entry, so without this there is no path
            to /app/settings (or Log out, which lives on the Account tab) on
            mobile. Hidden on desktop (see AppShell.css). */}
        <Link
          to="/app/settings"
          className={`aa-app-mobile-avatar ${isActive("/app/settings") ? "active" : ""}`}
          title="Settings"
          aria-label="Settings"
        >
          {initials || <UserIcon />}
        </Link>
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
        <Kbd>⌘K</Kbd>
      </button>

      {/* ---- Global overlays (capture popover + shortcut cheatsheet) ---- */}
      {captureOpen && (
        <CapturePopover
          onClose={() => setCaptureOpen(false)}
          projects={resolverProjects ?? []}
          customLensNames={customLensNames}
          activeLensName={activeLens?.name ?? null}
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
