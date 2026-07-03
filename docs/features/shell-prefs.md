---
slug: shell-prefs
title: "Shell, nav, shortcuts, dark mode, settings"
feature_area: foundation
status: shipped
spec: —
verified: 2026-07-03
---

# Shell, nav, shortcuts, dark mode, settings

**AppShell** (`app/AppShell.tsx`) — focus-switch nav: three expanding sections
(Work / Plan / Review), one open at a time, auto-switches with route. Lens
switch (`LensSwitch`, Work/Me) rendered separately above. Capture pinned
outside both.

**Keyboard shortcuts** (`app/useKeyboardShortcuts.ts`) — ⌘K capture, Space →
Next, Shift+I/N/T/G/P/R nav, `?` cheatsheet (`components/ui/ShortcutCheatsheet.tsx`),
Esc close.

**Dark mode** — Preferences toggle + AppShell applies persisted/system theme to
`data-theme`. Live.

**Settings** (`app/SettingsPage.tsx`) — Account (name/email/call-me + log out;
"change email/password/delete account coming soon"). **Preferences**
(`app/PreferencesPage.tsx`) — Today cap, completion sounds, Momentum counter are
**stubs** with "soon" chips (not fake toggles).

**Files.** `app/AppShell.tsx`; `app/SettingsPage.tsx`; `app/PreferencesPage.tsx`;
`app/useKeyboardShortcuts.ts`; `components/ui/ShortcutCheatsheet.tsx`.

**Done?** Shipped. Hard focus mode (each mode as distinct full-screen layout) is
the north star, not built — see ROADMAP §Icebox.
