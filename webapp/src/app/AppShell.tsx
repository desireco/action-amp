import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth, logout } from "wasp/client/auth";
import {
  useQuery,
  ensureOnboarded,
  getAppData,
  createInboxItem,
  submitFeedback,
  getProjectsForResolver,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { LensContext } from "./lensContext";
import {
  useKeyboardShortcuts,
  type NavDestination,
} from "./useKeyboardShortcuts";
import { FeedbackDialog } from "./FeedbackDialog";
import { captureFeedbackContext } from "../feedback/captureContext";
import {
  Button,
  CloseButton,
  CapturePopover,
  ShortcutCheatsheet,
  ConfirmDialog,
  ProGate,
  LensChip,
  LensPopover,
  Kbd,
} from "../components/ui";
import { useEntitled } from "../billing/useEntitled";
import {
  CommandPalette,
  type CommandPaletteMode,
} from "../search/CommandPalette";
import { isPaletteBlocked } from "../search/paletteAvailability";
import { applyTheme, preferredTheme, toggleTheme } from "./theme";
import { fileToImageAttachmentInput } from "../shared/imageFiles";
import {
  registerServiceWorker,
  useServiceWorkerUpdate,
  useDeployedVersionUpdate,
} from "../notifications/client";
import {
  BrandMark,
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
  SearchIcon,
} from "../components/ui";
import "./AppShell.css";

/**
 * Authenticated app shell — the persistent chrome framing every /do page.
 *
 * Sidebar structure (WORKFLOW.md):
 *   - Brand + Lens switch (context — Work/Me, always available)
 *   - Universal nav: Inbox + Today (always visible, span every lens)
 *   - Focus nav: Do (flat link → /do, the Next/What-Now chooser) + two
 *     always-open groups (Plan / Review) labeled with static headings.
 *   - User footer
 *
 * Capture is a lower-right floating action, pervasive across all modes.
 */

/** Routes for the Shift-letter navigation chords (useKeyboardShortcuts). */
const NAV_ROUTE: Record<NavDestination, string> = {
  inbox: "/do/inbox",
  next: "/do",
  today: "/do/today",
  triage: "/do/inbox/review",
  planning: "/do/projects",
  review: "/do/review",
};

function ListIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 4h7M6 8h7M6 12h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m2.5 4 1 1 1.5-2M2.5 8l1 1L5 7M2.5 12l1 1L5 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
    applyTheme(preferredTheme());
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
    projects: 0,
    goals: 0,
  };
  const reviewPreferences = appData?.reviewPreferences ?? {
    today: true,
    week: true,
    month: true,
  };
  // (todayByLens removed — Today is global, so per-lens Today counts in the
  // switcher no longer reflect what the page shows. WORKFLOW.md §5.11.)

  // Capture autocomplete sources — fetched here (gated on user, same as
  // getAppData) and passed as props to CapturePopover so the popover stays a
  // pure-UI component with no queries/auth of its own. CapturePopover renders
  // outside the LensContext provider, so making it do its own queries was racy
  // (auth not resolved at mount → 500s). One query site, one auth gate.
  const { data: resolverProjects } = useQuery(
    getProjectsForResolver,
    undefined,
    {
      enabled: !!user,
    },
  );
  // Lens names for the [[ ]] parser — seeded (work/personal/me) are always
  // known to the parser; custom names must be supplied.
  const customLensNames = lenses.map((l) => l.name);

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
    !entitled && resolvedLens && !resolvedLens.isIncluded
      ? (lenses.find((l) => l.isIncluded) ?? resolvedLens)
      : resolvedLens;
  const activeLensName = activeLens?.name ?? "Me";
  const isSimpleListLens = activeLens?.type === "SIMPLE_LIST";
  // Self-heal: if the stored id no longer matches a lens (deleted?), persist
  // the fallback so we don't keep looking up a stale id.
  useEffect(() => {
    if (activeLens && activeLens.id !== lensId) {
      setLensIdState(activeLens.id);
      localStorage.setItem("aa-lens-id", activeLens.id);
      setWorkGated(false);
    }
  }, [activeLens, lensId]);

  // A Lens type owns its workflow routes. Keep settings/admin reachable as
  // persistent account surfaces, but normalize every workflow route after the
  // active Lens resolves so stale URLs cannot expose the other workflow.
  useEffect(() => {
    if (!activeLens) return;
    const isPersistentRoute =
      location.pathname.startsWith("/do/settings") ||
      location.pathname.startsWith("/do/admin") ||
      location.pathname.startsWith("/do/inbox");
    if (
      activeLens.type === "SIMPLE_LIST" &&
      location.pathname !== "/do/list" &&
      !isPersistentRoute
    ) {
      navigate("/do/list", { replace: true });
    } else if (
      activeLens.type === "LIFE_AREA" &&
      location.pathname === "/do/list"
    ) {
      navigate("/do", { replace: true });
    }
  }, [activeLens?.id, activeLens?.type, location.pathname, navigate]);

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
          purpose: l.purpose ?? undefined,
          type: l.type,
          // FREE: only PERSONAL is usable; WORK + CUSTOM are gated.
          proLocked: workLocked && !l.isIncluded,
        }))
      : [
          {
            id: "Work",
            label: "Work",
            color: "indigo",
            purpose: undefined,
            type: "LIFE_AREA" as const,
            proLocked: workLocked,
          },
          {
            id: "Me",
            label: "Me",
            color: "emerald",
            purpose: undefined,
            type: "LIFE_AREA" as const,
            proLocked: false,
          },
        ];
  // Lens is persistent context, not a set of peer pages. Always show the current
  // lens as one trigger, then reveal the complete choice set in its popover.
  // This stays compact and legible when users add custom lenses.

  // Select handler with FREE gating: a non-entitled user picking a non-PERSONAL
  // lens sees the ProGate in the main area instead of switching (their queries
  // would 402 server-side anyway). Stays on the current lens so the data behind
  // the gate stays valid. Branches on KIND, not name — rename-safe.
  const selectLens = (id: string) => {
    const target = lenses.find((l) => l.id === id);
    if (!entitled && target && !target.isIncluded) {
      setWorkGated(true);
      return;
    }
    setWorkGated(false);
    setLens(id);
    if (target?.type === "SIMPLE_LIST" && !location.pathname.startsWith("/do/inbox")) navigate("/do/list");
    else if (target?.type === "LIFE_AREA" && location.pathname === "/do/list")
      navigate("/do");
  };

  // The value pages consume via useActiveLens() to scope their queries.
  const activeLensValue = activeLens
    ? {
        id: activeLens.id,
        name: activeLens.name,
        color: activeLens.color ?? null,
        isIncluded: activeLens.isIncluded,
        type: activeLens.type,
        purpose: activeLens.purpose,
      }
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
    to === "/do"
      ? location.pathname === "/do"
      : location.pathname.startsWith(to);
  const isWeekPlanning = location.pathname === "/do/week";

  // Section-level active state for the mobile dock (Plan/Review dock items
  // each represent a whole section, not one route). Mirrors sectionForPath so
  // the dock highlight agrees with the section label.
  const inPlan = ["upcoming", "projects", "goals", "someday"].some((p) =>
    location.pathname.startsWith(`/do/${p}`),
  );
  const inReview =
    location.pathname.startsWith("/do/review") ||
    location.pathname.startsWith("/do/logbook");

  // ponytail: 1–2 letter initials from fullName (first + last token). Good enough for an avatar.
  const initials = user
    ? user.fullName
        .split(/\s+/)
        .map((s) => s[0] ?? "")
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  // ---- Focus nav: which section is expanded (one at a time) ----
  // Auto-switches when the user navigates to a page in a different section.
  // Do/Next, Today, and Inbox are flat links outside this state (universal),
  // so only Plan/Review participate.
  // One-shot migration: the focus switch (expanding Plan/Review sections) is
  // gone — both are always open now. Clear any stale "aa-focus" value the user
  // persisted from the old single-section-open behavior so it doesn't linger
  // as dead data. No-op after the first load post-update.
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("aa-focus")) {
      localStorage.removeItem("aa-focus");
    }
  }, []);

  // ---- Overlays (capture popover, shortcut cheatsheet) ----
  // Focus mode is page-scoped (set by a task's onOpen), so it lives in pages,
  // not the shell. Esc closes whichever overlay is open.
  const [captureOpen, setCaptureOpen] = useState(false);
  // Files dropped on the capture FAB while the popover was closed — fed into
  // the popover via initialFiles on open. Reset on every open (⌘K etc.
  // just pass nothing).
  const [pendingCaptureFiles, setPendingCaptureFiles] = useState<File[]>([]);
  const [fabDragOver, setFabDragOver] = useState(false);
  // dragenter/leave depth counter for the FAB (they fire per child element).
  const fabDragDepth = useRef(0);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [mobileLensOpen, setMobileLensOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lensPopoverOpen, setLensPopoverOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<CommandPaletteMode | null>(
    null,
  );
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const closeGlobalOverlays = () => {
    setCaptureOpen(false);
    setCheatsheetOpen(false);
    setConfirmLogout(false);
    setMobileLensOpen(false);
    setFeedbackOpen(false);
    setLensPopoverOpen(false);
    setPaletteMode(null);
  };

  const openCapture = (files?: File[]) => {
    closeGlobalOverlays();
    setPendingCaptureFiles(files && files.length > 0 ? files : []);
    setCaptureOpen(true);
  };

  const openPalette = (mode: CommandPaletteMode) => {
    closeGlobalOverlays();
    setPaletteMode(mode);
  };

  // New SW waiting → offer a one-click refresh into the next build.
  const sw = useServiceWorkerUpdate();
  // Idle-tab fallback: poll /version.json and prompt when the deployed SHA
  // drifts from this bundle's __APP_VERSION__. SW detection only fires on
  // navigation; this closes the gap for tabs open across a deploy.
  const deployed = useDeployedVersionUpdate();
  const showUpdateBanner =
    (sw.updateAvailable || deployed.updateAvailable) && !updateDismissed;
  // Pick whichever path surfaced the update: SW needs the SKIP_WAITING
  // handoff, the poll path just reloads into the new build.
  const applyUpdate = sw.updateAvailable
    ? sw.applyUpdate
    : deployed.applyUpdate;

  // Manifest shortcut and notification action: /do?capture=1 opens the same
  // universal capture surface as ⌘K, then removes the one-shot URL flag.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("capture") !== "1") return;
    openCapture();
    const params = new URLSearchParams(location.search);
    params.delete("capture");
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  const inSettings = isActive("/do/settings");
  const inFocus = location.pathname.startsWith("/do/focus");
  const inTriage = location.pathname.startsWith("/do/inbox/review");
  const paletteBlocked = isPaletteBlocked({
    working: inFocus,
    triage: inTriage,
    capture: captureOpen,
    shortcuts: cheatsheetOpen,
    confirmation: confirmLogout,
    feedback: feedbackOpen,
    mobileLens: mobileLensOpen,
    palette: Boolean(paletteMode),
  });

  useKeyboardShortcuts({
    onCapture: openCapture,
    onSearch: () => {
      if (!paletteBlocked) openPalette("search");
    },
    onCommandPalette: () => {
      if (!paletteBlocked) openPalette("command");
    },
    onGoHome: isSimpleListLens ? undefined : () => navigate("/do"),
    onNavigate: (dest) =>
      navigate(isSimpleListLens ? "/do/list" : NAV_ROUTE[dest]),
    onToggleCheatsheet: () => {
      const next = !cheatsheetOpen;
      closeGlobalOverlays();
      setCheatsheetOpen(next);
    },
    onToggleLens: () => {
      const next = !lensPopoverOpen;
      closeGlobalOverlays();
      setLensPopoverOpen(next);
    },
    onCloseOverlay: () => {
      if (paletteMode) setPaletteMode(null);
      else if (captureOpen) setCaptureOpen(false);
      else if (cheatsheetOpen) setCheatsheetOpen(false);
      else if (confirmLogout) setConfirmLogout(false);
      else if (feedbackOpen) setFeedbackOpen(false);
      else if (lensPopoverOpen) setLensPopoverOpen(false);
      else if (mobileLensOpen) setMobileLensOpen(false);
    },
  });

  // Lock body scroll while any overlay is open.
  useEffect(() => {
    const open = Boolean(
      captureOpen ||
      cheatsheetOpen ||
      confirmLogout ||
      feedbackOpen ||
      paletteMode,
    );
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [captureOpen, cheatsheetOpen, confirmLogout, feedbackOpen, paletteMode]);

  // On mobile, hide the bottom dock while in Settings or Focus mode. Settings
  // is a deliberate detour from the focus loop (its tabs are all inactive
  // there); Focus is a full-screen modal where the dock actively overlaps the
  // keyboard-rail hints. In both, reclaiming the thumb zone helps and the FAB
  // stays for capture. Desktop is unaffected (the dock is already display:none
  // above 768px).
  return (
    <div
      className={`aa-app${inSettings ? " is-in-settings" : ""}${inFocus ? " is-in-focus" : ""}`}
    >
      <aside className="aa-app-side">
        <Link
          className="aa-app-brand"
          to={isSimpleListLens ? "/do/list" : "/do"}
          title={isSimpleListLens ? "List" : "Next"}
        >
          <span className="aa-app-mark" aria-hidden="true">
            <BrandMark size="sm" />
          </span>
          <span className="aa-app-brand-name">ActionAmp</span>
        </Link>

        <div className="aa-app-utility-cluster" aria-label="Shell utilities">
          <button
            type="button"
            className="aa-app-utility-btn aa-app-search-btn"
            onClick={() => openPalette("search")}
            title={entitled ? "Search (/)" : "Sitewide search (Pro)"}
            aria-label={entitled ? "Search" : "Search (Pro)"}
            disabled={paletteBlocked}
          >
            <SearchIcon />
            {!entitled && <span className="aa-app-search-pro">Pro</span>}
          </button>
          {/* Shortcuts (?) — keyboard-only; hidden on touch (see AppShell.css).
              Desktop utility cluster order (right→left): shortcuts, feedback,
              avatar/settings. On mobile, this lives in the header beside brand. */}
          <button
            type="button"
            className="aa-app-utility-btn aa-app-shortcuts-btn"
            onClick={() => {
              closeGlobalOverlays();
              setCheatsheetOpen(true);
            }}
            title="Shortcuts (?)"
            aria-label="Shortcuts"
          >
            ?
          </button>
          <button
            type="button"
            className="aa-app-utility-btn"
            onClick={() => {
              closeGlobalOverlays();
              setFeedbackOpen(true);
            }}
            title="Leave feedback"
            aria-label="Leave feedback"
          >
            <LoudspeakerIcon />
          </button>
          {/* Mobile-only avatar → Settings. The sidebar footer that hosts the
              desktop avatar/settings link is display:none at ≤768px, and the
              bottom dock has no settings entry, so without this there is no path
              to /do/settings (or Log out, which lives on the Account tab) on
              mobile. Hidden on desktop (see AppShell.css). */}
          <Link
            to="/do/settings"
            className={`aa-app-mobile-avatar ${isActive("/do/settings") ? "active" : ""}`}
            title="Settings"
            aria-label="Settings"
          >
            {initials || <UserIcon />}
          </Link>
        </div>

        {/* ---- Primary nav — always-visible destinations ----
            Inbox (capture, universal), Today (day's commitment, universal),
            Do (Next/What-Now chooser, lens-scoped). All three are flat links;
            none belongs to a group, so they sit together at the top. */}
        {isSimpleListLens && (
          <nav className="aa-app-nav" aria-label="List navigation">
            <NavItem
              icon={<InboxIcon />}
              label="Inbox"
              active={isActive("/do/inbox")}
              to="/do/inbox"
              count={counts.inbox || undefined}
            />
            <NavItem
              icon={<ListIcon />}
              label="List"
              active={isActive("/do/list")}
              to="/do/list"
            />
          </nav>
        )}
        {!isSimpleListLens && (
          <>
            <nav className="aa-app-nav">
              <NavItem
                icon={<InboxIcon />}
                label="Inbox"
                active={isActive("/do/inbox")}
                to="/do/inbox"
                count={
                  counts.inbox > 0 ? (
                    counts.inbox
                  ) : (
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-label="Inbox zero"
                    >
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )
                }
                countVariant={counts.inbox > 0 ? "urgent" : "done"}
              />
              <NavItem
                icon={<ClockIcon />}
                label={isWeekPlanning ? "Week" : "Today"}
                active={isWeekPlanning || isActive("/do/today")}
                to={isWeekPlanning ? "/do/week" : "/do/today"}
                count={counts.today}
              />
              <NavItem
                icon={<StarIcon />}
                label="Do"
                active={isActive("/do")}
                to="/do"
              />
            </nav>

            {/* ---- Group nav — always-open Plan + Review labeled groups ----
            The expanding-section switch (one open at a time) is gone — it
            added a click before anything was visible and auto-collapsed
            sections unpredictably on route changes. Plan and Review render
            their items directly under static labels. */}
            <nav className="aa-focus-nav">
              <div className="aa-focus-group">
                <div className="aa-focus-label" aria-hidden="true">
                  Plan
                </div>
                <div className="aa-focus-items">
                  <NavItem
                    icon={<CalendarIcon />}
                    label="Upcoming"
                    active={isActive("/do/upcoming")}
                    to="/do/upcoming"
                    count={counts.upcoming}
                  />
                  <NavItem
                    icon={<ProjectsIcon />}
                    label="Projects"
                    active={isActive("/do/projects")}
                    to="/do/projects"
                    count={counts.projects}
                  />
                  <NavItem
                    icon={<GoalsIcon />}
                    label="Goals"
                    active={isActive("/do/goals")}
                    to="/do/goals"
                    count={counts.goals}
                  />
                  <NavItem
                    icon={<SomedayIcon />}
                    label="Someday"
                    active={isActive("/do/someday")}
                    to="/do/someday"
                    count={counts.someday}
                  />
                </div>
              </div>

              <div className="aa-focus-group">
                <div className="aa-focus-label" aria-hidden="true">
                  Review
                </div>
                <div className="aa-focus-items">
                  {reviewPreferences.today && (
                    <NavItem
                      icon={<ClockIcon />}
                      label="Today"
                      active={isActive("/do/review/today")}
                      to="/do/review/today"
                    />
                  )}
                  {reviewPreferences.week && (
                    <NavItem
                      icon={<CalendarIcon />}
                      label="Week"
                      active={isActive("/do/review/week")}
                      to="/do/review/week"
                    />
                  )}
                  {reviewPreferences.month && (
                    <NavItem
                      icon={<GoalsIcon />}
                      label="Month"
                      active={isActive("/do/review/month")}
                      to="/do/review/month"
                    />
                  )}
                  <NavItem
                    icon={<LogbookIcon />}
                    label="Logbook"
                    active={isActive("/do/logbook")}
                    to="/do/logbook"
                  />
                </div>
              </div>
            </nav>
          </>
        )}

        {/* User footer */}
        <div className="aa-app-user">
          {/* Lens is persistent context, exposed through one compact trigger.
              ⌘L toggles the popover; the wrapper anchors it under the chip. */}
          <div className="aa-app-lens">
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
                onNewLens={
                  entitled
                    ? () => navigate("/do/settings/lenses")
                    : undefined
                }
                newLensProLocked={!entitled}
              />
            )}
          </div>
          <Link
            to="/do/settings"
            className={`aa-app-user-btn ${isActive("/do/settings") ? "active" : ""}`}
            title="Settings"
          >
            <span className="aa-app-user-avatar" aria-hidden="true">
              {initials || <UserIcon />}
            </span>
            <span className="aa-app-user-name">
              {user ? user.fullName : ""}
            </span>
          </Link>
          {user?.isAdmin && (
            <Link
              to="/do/admin/overview"
              className={`aa-app-admin-link ${isActive("/do/admin") ? "active" : ""}`}
            >
              Admin
            </Link>
          )}
          <button
            type="button"
            className="aa-app-logout"
            onClick={() => setConfirmLogout(true)}
          >
            Log out
          </button>
        </div>
      </aside>

      {/* ============================ MAIN ============================ */}
      <div className="aa-app-mainwrap">
        {showUpdateBanner && (
          <div
            className="aa-app-update-banner"
            role="status"
            aria-live="polite"
          >
            <span className="aa-app-update-banner__copy">
              A new version of ActionAmp is available.
            </span>
            <span className="aa-app-update-banner__actions">
              <Button size="sm" variant="primary" onClick={applyUpdate}>
                Refresh
              </Button>
              <CloseButton
                onClose={() => setUpdateDismissed(true)}
                label="Dismiss update banner"
              />
            </span>
          </div>
        )}
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

      <nav
        className={`aa-mobile-dock ${mobileLensOpen ? "is-lens-open" : ""}`}
        aria-label="Mobile navigation"
      >
        {mobileLensOpen && (
          <div
            className="aa-mobile-lens-menu"
            role="menu"
            aria-label="Choose Lens"
          >
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
              </button>
            ))}
          </div>
        )}
        <div
          className={`aa-mobile-dock__row${isSimpleListLens ? " is-simple-list" : ""}`}
        >
          {isSimpleListLens ? (
            <>
              <Link
                className={`aa-mobile-dock__item ${isActive("/do/inbox") ? "active" : ""}`}
                to="/do/inbox"
                aria-label="Inbox"
              >
                <InboxIcon />
                <span>Inbox</span>
              </Link>
              <Link
                className={`aa-mobile-dock__item ${isActive("/do/list") ? "active" : ""}`}
                to="/do/list"
                aria-label="List"
              >
                <ListIcon />
                <span>List</span>
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
            </>
          ) : (
            <>
              {/* Mobile dock: "Do" is the Next/What-Now chooser (the home screen).
              "Today" leaves the dock (its slot is covered by a Today link on
              the Next page, plus the Today↔Upcoming cross-link). Desktop keeps
              the full Next/Today sidebar split. */}
              <Link
                className={`aa-mobile-dock__item ${isActive("/do/inbox") ? "active" : ""}`}
                to="/do/inbox"
                aria-label="Inbox"
              >
                <InboxIcon />
                <span>Inbox</span>
              </Link>
              <Link
                className={`aa-mobile-dock__item ${isActive("/do") ? "active" : ""}`}
                to="/do"
                aria-label="Do"
              >
                <StarIcon />
                <span>Do</span>
              </Link>
              <Link
                className={`aa-mobile-dock__item ${inPlan ? "active" : ""}`}
                to="/do/projects"
                aria-label="Plan"
              >
                <ProjectsIcon />
                <span>Plan</span>
              </Link>
              <Link
                className={`aa-mobile-dock__item ${inReview ? "active" : ""}`}
                to="/do/review"
                aria-label="Review"
              >
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
            </>
          )}
        </div>
      </nav>

      <button
          type="button"
          className={`aa-app-capture-fab ${fabDragOver ? "is-dragover" : ""} ${mobileLensOpen ? "is-hidden-while-lens-open" : ""}`}
          title="Capture (⌘K)"
          aria-label="Capture"
          onClick={() => openCapture()}
          onDragEnter={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            fabDragDepth.current += 1;
            setFabDragOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            fabDragDepth.current = Math.max(0, fabDragDepth.current - 1);
            if (fabDragDepth.current === 0) setFabDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            fabDragDepth.current = 0;
            setFabDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter((f) =>
              f.type.startsWith("image/"),
            );
            if (files.length > 0) openCapture(files);
          }}
        >
          <PlusIcon width={18} height={18} />
          <span>Capture</span>
          <Kbd>⌘K</Kbd>
      </button>

      {/* ---- Global overlays ---- */}
      {paletteMode && (
        <CommandPalette
          mode={paletteMode}
          entitled={entitled}
          lenses={lenses.map((lens) => ({
            id: lens.id,
            name: lens.name,
            color: lens.color,
          }))}
          onClose={() => setPaletteMode(null)}
          onNavigate={(href) => navigate(href)}
          onSwitchLens={selectLens}
          onCapture={openCapture}
          onToggleTheme={toggleTheme}
          onOpenShortcuts={() => setCheatsheetOpen(true)}
          activeLensType={activeLens?.type ?? "LIFE_AREA"}
        />
      )}
      {captureOpen && (
        <CapturePopover
          onClose={() => setCaptureOpen(false)}
          projects={resolverProjects ?? []}
          customLensNames={customLensNames}
          activeLensName={activeLens?.name ?? null}
          initialFiles={pendingCaptureFiles}
          onSubmit={async (text, files) => {
            // Belt-and-suspenders: the App.tsx gate should make this
            // unreachable without a user, but never fire an auth-required
            // action unauthenticated (the original "Not authenticated" 500).
            if (!user) return;
            // Image-only captures need display text in the inbox — same
            // fallback the share target uses (first filename).
            const attachments = files?.length
              ? await Promise.all(files.map(fileToImageAttachmentInput))
              : undefined;
            await createInboxItem({
              text: text || files?.[0]?.name || "Image",
              attachments,
            });
            // Invalidate the inbox list + the sidebar counts so both refresh.
            // Without this, React Query serves the stale pre-capture cache
            // and the new item doesn't appear until a manual reload.
            queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
            queryClient.invalidateQueries({ queryKey: ["getAppData"] });
            // Capture can advance the first-run guidance stage. Refresh auth
            // data so Next immediately changes from "Capture" to "Triage".
            queryClient.invalidateQueries({ queryKey: ["auth/me"] });
          }}
        />
      )}
      {cheatsheetOpen && (
        <ShortcutCheatsheet onClose={() => setCheatsheetOpen(false)} />
      )}
      {feedbackOpen && (
        <FeedbackDialog
          onClose={() => setFeedbackOpen(false)}
          onSubmit={async (message) => {
            await submitFeedback({
              message,
              ...captureFeedbackContext(location),
              lens: activeLensValue,
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
