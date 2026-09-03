<script lang="ts">
  /**
   * Shell — the authenticated app chrome, ported from
   * webapp/src/app/AppShell.tsx (the sidebar is THE identity of the app).
   *
   * Sidebar structure (WORKFLOW.md):
   *   - Brand + Lens switch (context — Work/Me, always available)
   *   - Universal nav: Inbox + Today + Do (flat links at the top)
   *   - Focus nav: two always-open groups (Plan / Review) with static headings
   *   - User footer: lens chip, avatar+name → Settings, Admin, Log out
   *
   * Capture is a lower-right floating action (CaptureFab), pervasive across
   * all modes. The ⌘K / ⌘\ / "/" chords stay in the capture/search stores
   * (root layout); this shell adds the ⇧-letter nav chords, Space → home,
   * ⌘L lens toggle, and the Esc overlay cascade (useKeyboardShortcuts parity).
   *
   * Global overlays (CapturePopover, CommandPalette, OnboardingGate) stay
   * mounted in the root +layout.svelte — the shell does not duplicate them.
   * FeedbackDialog + ConfirmDialog(logout) are shell-scoped and live here.
   */
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import "../styles/app-shell.css";
  import "../styles/NavItem.css";
  import LensSwitcher from "./LensSwitcher.svelte";
  import CaptureFab from "./CaptureFab.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import FeedbackDialog from "./FeedbackDialog.svelte";
  import ProGate from "./ui/ProGate.svelte";
  import { lenses } from "../stores/lenses.svelte";
  import { prefs } from "../stores/prefs.svelte";
  import { capture } from "../stores/capture.svelte";
  import { search } from "../stores/search.svelte";
  import { feedback } from "../stores/feedback.svelte";
  import { fetchAuthUser, logout, type AuthUser } from "../auth";
  import { applyTheme, preferredTheme } from "../theme";

  let { children } = $props();

  // ---- Identity (the webapp read useAuth(); the port reads /api/auth/me) ----
  let user = $state<AuthUser | null>(null);
  // The ⌘L popover (bound into LensSwitcher) + the mobile lens menu.
  let lensOpen = $state(false);
  let mobileLensOpen = $state(false);
  let confirmLogout = $state(false);

  // Mount-once (webapp useEffect([]) parity): theme on app entry, the shell
  // data load, and the footer identity. The stored lens hydrates FIRST so no
  // screen's first load races the shell's resolution; loadAppData then runs
  // the account + appData reads in parallel and self-heals a stale id.
  let booted = false;
  $effect(() => {
    if (booted) return;
    booted = true;
    applyTheme(preferredTheme());
    lenses.hydrateStoredLens();
    void lenses.loadAppData();
    void fetchAuthUser().then((u) => (user = u));
  });

  const path = $derived(page.url.pathname);
  // Entitlement: FREE users may only use the included lens. Locked lenses stay
  // "visible-but-locked" — selecting one shows the ProGate in the main area
  // (the friendly surface; the server guard is the boundary). Defaults to
  // entitled until the Account read lands (the prefs-store convention).
  const entitled = $derived(prefs.account?.entitled ?? true);
  const inSettings = $derived(path.startsWith("/do/settings"));
  const inFocus = $derived(path.startsWith("/do/focus"));
  const isWeekPlanning = $derived(path === "/do/week");

  // Nav counts, re-scoped to the active lens (the store re-reads appData on
  // every switch). The contract's appData carries today/upcoming/someday only
  // — Inbox/Projects/Goals badges land when those counts join the payload.
  const counts = $derived(
    lenses.appData?.counts ?? { today: 0, upcoming: 0, someday: 0 },
  );

  // ponytail: 1–2 letter initials from fullName. Good enough for an avatar.
  const initials = $derived(
    (user?.fullName ?? "")
      .split(/\s+/)
      .map((s) => s[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  );

  const activeLensName = $derived(lenses.active?.name ?? "Me");

  // The lens switch options (+ the webapp's placeholder pair before lenses
  // load). FREE: only the included lens is usable; the rest render Pro chips.
  interface LensOption {
    id: string;
    label: string;
    color: string | null;
    purpose: string | null;
    proLocked: boolean;
  }
  const lensOptions = $derived<LensOption[]>(
    lenses.lenses.length > 0
      ? lenses.lenses.map((l) => ({
          id: l.id,
          label: l.name,
          color: l.color,
          purpose: l.purpose,
          proLocked: !entitled && !l.isIncluded,
        }))
      : [
          { id: "Work", label: "Work", color: "indigo", purpose: null, proLocked: !entitled },
          { id: "Me", label: "Me", color: "emerald", purpose: null, proLocked: false },
        ],
  );

  const selectLens = (id: string) => void lenses.switch(id, prefs.account);

  // "/" is this stack's host for the Do screen (the webapp's /do), so the Do
  // item reads active on both.
  const isActive = (to: string) =>
    to === "/do"
      ? path === "/do" || path === "/"
      : path.startsWith(to);

  // Section-level active state for the mobile dock (Plan/Review dock items
  // each represent a whole section, not one route).
  const inPlan = $derived(
    ["upcoming", "projects", "goals", "someday"].some((p) =>
      path.startsWith(`/do/${p}`),
    ),
  );
  const inReview = $derived(
    path.startsWith("/do/review") || path.startsWith("/do/logbook"),
  );

  // ---- Keyboard: the useKeyboardShortcuts parity set ---------------------
  // ⌘K capture, ⌘\ command, "/" search and ⇧C capture live in the capture/
  // search stores (root layout). Here: ⌘L, Esc, Space, and the ⇧-letter nav.
  //
  // One grammar: Shift + the first letter of the destination (webapp
  // useKeyboardShortcuts SHIFT_NAV). R deviates deliberately: the webapp's
  // /do/review hub has no route in this stack yet, so R lands on Logbook —
  // the review surface that exists.
  const SHIFT_NAV: Record<string, string> = {
    I: "/do/inbox",
    N: "/do",
    T: "/do/today",
    G: "/do/inbox/review", // triaGe
    P: "/do/projects",
    R: "/do/logbook",
  };

  function closeOverlays() {
    capture.hide();
    search.hide();
    feedback.hide();
    confirmLogout = false;
    mobileLensOpen = false;
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  }

  function onKey(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;

    // ⌘L — toggle the lens switcher. Above the typing guard so it fires in
    // fields too (webapp parity; the browser's "focus location bar" default
    // is prevented inside the app shell).
    if (meta && e.key.toLowerCase() === "l") {
      e.preventDefault();
      const next = !lensOpen;
      closeOverlays();
      lensOpen = next;
      return;
    }

    // Esc — always closes the topmost overlay. Never blocked by typing.
    if (e.key === "Escape") {
      if (search.open) search.hide();
      else if (capture.open) capture.hide();
      else if (confirmLogout) confirmLogout = false;
      else if (feedback.open) feedback.hide();
      else if (lensOpen) lensOpen = false;
      else if (mobileLensOpen) mobileLensOpen = false;
      return;
    }

    // Everything below is disabled while typing.
    if (isTypingTarget(e.target)) return;

    // Space → Do (the home base). Never steals native activation from
    // buttons, links, or other interactive controls — and yields to screens
    // that own the key: the simple-list keyset toggles with Space and
    // preventDefaults later in the same dispatch (the screen's listener
    // registers after this one), so the navigation re-checks the event after
    // dispatch completes and stands down when the key was claimed.
    if (e.key === " ") {
      if (e.defaultPrevented) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("button, a, [role='button'], [role='link']")) return;
      e.preventDefault();
      setTimeout(() => {
        if (!e.defaultPrevented) void goto("/do");
      });
      return;
    }

    // Shift + letter → navigation (true Shift+letter presses only — keyed on
    // the shifted glyph, so Shift+arrow / Shift+symbol never match).
    if (e.shiftKey && e.key.length === 1) {
      const to = SHIFT_NAV[e.key.toUpperCase()];
      if (to) {
        e.preventDefault();
        void goto(to);
      }
    }
  }

  // Lock body scroll while any overlay is open (webapp parity).
  $effect(() => {
    const open = capture.open || confirmLogout || feedback.open || search.open;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  });

  async function logOut() {
    // The real session end (webapp logout() parity): the API deletes the
    // Session row and clears the httpOnly cookie; landing on /login matches
    // the webapp, which drops logged-out users on the login screen.
    confirmLogout = false;
    await logout();
    await goto("/login", { replaceState: true });
  }

  // NavItem args — the aa-nav-item link model (NavItem.tsx parity; the
  // navItem snippet below renders it, NavItem.css carries the styles).
  interface NavItemArgs {
    icon: Snippet;
    label: string;
    active?: boolean;
    to: string;
    count?: number;
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- ---- Icons — verbatim SVGs from webapp/src/components/ui/icons.tsx ----- -->
{#snippet brandMark()}
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M3.5 8.5l3 3 6-7"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}
{#snippet searchIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4" />
    <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  </svg>
{/snippet}
{#snippet inboxIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
{/snippet}
{#snippet clockIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4" />
    <path d="M8 5v3.5l2 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  </svg>
{/snippet}
{#snippet starIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 1.5l1.8 4.2 4.5.4-3.4 3 1 4.4L8 11.3 4.1 13.5l1-4.4-3.4-3 4.5-.4z"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}
{#snippet calendarIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  </svg>
{/snippet}
{#snippet somedayIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2.5 8c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5-2.5 5.5-5.5 5.5-5.5-2.5-5.5-5.5z"
      stroke="currentColor"
      stroke-width="1.4"
    />
    <path
      d="M8 5v3"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-dasharray="1 1.5"
    />
  </svg>
{/snippet}
{#snippet projectsIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 4h3l1.5 8h6L14 6H5"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="6.5" cy="13.5" r="1" fill="currentColor" />
    <circle cx="11.5" cy="13.5" r="1" fill="currentColor" />
  </svg>
{/snippet}
{#snippet goalsIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 1l2.2 4.5 5 .7-3.6 3.5.85 5L8 12.3 3.55 14.7l.85-5L.8 6.2l5-.7z"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}
{#snippet logbookIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 13.5V4l4-1.5v11M6 8h4M10 13.5V6l4-1.5v9"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}
{#snippet loudspeakerIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2.5 9.5h2.2L9 12.2V3.8L4.7 6.5H2.5z"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linejoin="round"
    />
    <path
      d="M11 6.1c.6.5.9 1.2.9 1.9s-.3 1.4-.9 1.9M12.7 4.5c1 .9 1.6 2.1 1.6 3.5s-.6 2.6-1.6 3.5"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
    />
  </svg>
{/snippet}
{#snippet userIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.4" />
    <path
      d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

{#snippet navItem(p: NavItemArgs)}
  <a
    class="aa-nav-item {p.active ? "aa-nav-item--active" : ""}"
    href={p.to}
    aria-current={p.active ? "page" : undefined}
  >
    <span class="aa-nav-item__icon">{@render p.icon()}</span>
    <span class="aa-nav-item__label">{p.label}</span>
    {#if p.count !== undefined}
      <span class="aa-nav-item__count">{p.count}</span>
    {/if}
  </a>
{/snippet}

<div class="aa-app" class:is-in-settings={inSettings} class:is-in-focus={inFocus}>
  <!-- ============================ SIDEBAR ============================ -->
  <aside class="aa-app-side">
    <a class="aa-app-brand" href="/do" title="Next">
      <span class="aa-app-mark" aria-hidden="true">{@render brandMark()}</span>
      <span class="aa-app-brand-name">ActionAmp</span>
    </a>

    <div class="aa-app-utility-cluster" aria-label="Shell utilities">
      <button
        type="button"
        class="aa-app-utility-btn aa-app-search-btn"
        onclick={() => void search.show("search")}
        title={entitled ? "Search (/)" : "Sitewide search (Pro)"}
        aria-label={entitled ? "Search" : "Search (Pro)"}
        disabled={search.blocked}
      >
        {@render searchIcon()}
        {#if !entitled}<span class="aa-app-search-pro">Pro</span>{/if}
      </button>
      <!-- Feedback — the shell loudspeaker. (The webapp's "?" shortcuts
          button is deferred: this stack has no cheatsheet surface yet.) -->
      <button
        type="button"
        class="aa-app-utility-btn"
        onclick={() => {
          closeOverlays();
          feedback.show();
        }}
        title="Leave feedback"
        aria-label="Leave feedback"
      >
        {@render loudspeakerIcon()}
      </button>
      <!-- Mobile-only avatar → Settings (desktop hides it; the sidebar footer
          is display:none at ≤768px — AppShell.css). -->
      <a
        href="/do/settings"
        class="aa-app-mobile-avatar"
        class:active={inSettings}
        title="Settings"
        aria-label="Settings"
      >
        {#if initials}{initials}{:else}{@render userIcon()}{/if}
      </a>
    </div>

    <!-- ---- Primary nav — always-visible destinations ---- -->
    <nav class="aa-app-nav">
      {@render navItem({ icon: inboxIcon, label: "Inbox", active: isActive("/do/inbox"), to: "/do/inbox" })}
      {@render navItem({
        icon: clockIcon,
        label: isWeekPlanning ? "Week" : "Today",
        active: isWeekPlanning || isActive("/do/today"),
        to: isWeekPlanning ? "/do/week" : "/do/today",
        count: counts.today,
      })}
      {@render navItem({ icon: starIcon, label: "Do", active: isActive("/do"), to: "/do" })}
    </nav>

    <!-- ---- Group nav — always-open Plan + Review labeled groups ----
        The webapp's Review group also lists the Today/Week/Month review
        cadences (gated by reviewPreferences); those routes don't exist in
        this stack yet, so Review renders Logbook only. -->
    <nav class="aa-focus-nav">
      <div class="aa-focus-group">
        <div class="aa-focus-label" aria-hidden="true">Plan</div>
        <div class="aa-focus-items">
          {@render navItem({ icon: calendarIcon, label: "Upcoming", active: isActive("/do/upcoming"), to: "/do/upcoming", count: counts.upcoming })}
          {@render navItem({ icon: projectsIcon, label: "Projects", active: isActive("/do/projects"), to: "/do/projects" })}
          {@render navItem({ icon: goalsIcon, label: "Goals", active: isActive("/do/goals"), to: "/do/goals" })}
          {@render navItem({ icon: somedayIcon, label: "Someday", active: isActive("/do/someday"), to: "/do/someday", count: counts.someday })}
        </div>
      </div>

      <div class="aa-focus-group">
        <div class="aa-focus-label" aria-hidden="true">Review</div>
        <div class="aa-focus-items">
          {@render navItem({ icon: logbookIcon, label: "Logbook", active: isActive("/do/logbook"), to: "/do/logbook" })}
        </div>
      </div>
    </nav>

    <!-- User footer -->
    <div class="aa-app-user">
      <!-- Lens is persistent context, exposed through one compact trigger.
          ⌘L toggles the popover; the wrapper anchors it under the chip. -->
      <div class="aa-app-lens">
        <LensSwitcher
          bind:open={lensOpen}
          options={lensOptions}
          active={lenses.activeLensId ?? ""}
          onSelect={selectLens}
          onClose={() => {}}
          onNewLens={entitled ? () => void goto("/do/settings/lenses") : undefined}
          newLensProLocked={!entitled}
        />
      </div>
      <a href="/do/settings" class="aa-app-user-btn" class:active={inSettings} title="Settings">
        <span class="aa-app-user-avatar" aria-hidden="true">
          {#if initials}{initials}{:else}{@render userIcon()}{/if}
        </span>
        <span class="aa-app-user-name">{user?.fullName ?? ""}</span>
      </a>
      {#if user?.isAdmin}
        <a
          href="/do/admin/overview"
          class="aa-app-admin-link"
          class:active={path.startsWith("/do/admin")}
        >
          Admin
        </a>
      {/if}
      <button type="button" class="aa-app-logout" onclick={() => (confirmLogout = true)}>
        Log out
      </button>
    </div>
  </aside>

  <!-- ============================ MAIN ============================ -->
  <div class="aa-app-mainwrap">
    <!-- ---- Page content ----
        Work-lens gate: a FREE user picking a locked lens sees the ProGate in
        the main area instead of content. The lens isn't switched (the store
        bails), so the previous lens stays active behind the gate. -->
    <main class="aa-app-main">
      {#if lenses.gate}
        <div class="aa-app-gate">
          <ProGate feature={lenses.gate.feature} reason={lenses.gate.reason} />
        </div>
      {:else}
        {@render children()}
      {/if}
    </main>
  </div>

  <!-- Mobile thumb-zone dock (≤768px) -->
  <nav
    class="aa-mobile-dock"
    class:is-lens-open={mobileLensOpen}
    aria-label="Mobile navigation"
  >
    {#if mobileLensOpen}
      <div class="aa-mobile-lens-menu" role="menu" aria-label="Choose Lens">
        {#each lensOptions as l (l.id)}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={l.id === (lenses.activeLensId ?? "")}
            class="aa-mobile-lens-menu__item"
            class:active={l.id === lenses.activeLensId}
            data-lens-color={l.color}
            onclick={() => {
              selectLens(l.id);
              mobileLensOpen = false;
            }}
          >
            <span class="aa-mobile-lens-menu__dot" aria-hidden="true"></span>
            <span>{l.label}</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="aa-mobile-dock__row">
      <a class="aa-mobile-dock__item" class:active={isActive("/do/inbox")} href="/do/inbox" aria-label="Inbox">
        {@render inboxIcon()}
        <span>Inbox</span>
      </a>
      <a class="aa-mobile-dock__item" class:active={isActive("/do")} href="/do" aria-label="Do">
        {@render starIcon()}
        <span>Do</span>
      </a>
      <a class="aa-mobile-dock__item" class:active={inPlan} href="/do/projects" aria-label="Plan">
        {@render projectsIcon()}
        <span>Plan</span>
      </a>
      <a class="aa-mobile-dock__item" class:active={inReview} href="/do/logbook" aria-label="Review">
        {@render logbookIcon()}
        <span>Review</span>
      </a>
      <button
        type="button"
        class="aa-mobile-dock__item aa-mobile-dock__lens-btn"
        class:active={mobileLensOpen}
        aria-label="Lens: {activeLensName}"
        aria-expanded={mobileLensOpen}
        onclick={() => (mobileLensOpen = !mobileLensOpen)}
      >
        <span class="aa-mobile-dock__lens-dot" aria-hidden="true"></span>
        <span>{activeLensName}</span>
      </button>
    </div>
  </nav>

  <!-- Capture — lower-right floating action, pervasive across all modes. -->
  <CaptureFab />

  <!-- ---- Shell-scoped overlays ---- -->
  {#if feedback.open}
    <FeedbackDialog />
  {/if}
  {#if confirmLogout}
    <ConfirmDialog
      title="Log out?"
      message="You'll be signed out and return to the login page."
      confirmLabel="Log out"
      cancelLabel="Stay"
      danger
      onConfirm={logOut}
      onClose={() => (confirmLogout = false)}
    />
  {/if}
</div>
