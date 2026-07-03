import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts for ActionAmp.
 *
 * Wired in App.tsx so they work across every authenticated route. Each handler
 * is a no-op when the user is typing in an input/textarea/contenteditable
 * (except Esc, which always works to close overlays).
 *
 * Shortcuts (FEATURES.md §6):
 *   ⌘K / ⌘/      → open capture popover
 *   Space         → go to Next (home)
 *   g i/n/t/p/r   → jump to Inbox / Next / Triage / Planning / Review (vim-style
 *                   two-key chord; `g` arms a prefix, the next key dispatches)
 *   ? · ⌘?        → toggle the shortcut cheatsheet
 *   Esc           → close any open overlay (cheatsheet, capture, focus mode)
 *
 * Context-specific shortcuts (triage 1/2/3/P/R/Del + the property keys
 * `[`/`]`/`-`/`=`, focus F) are scoped to their own pages, not here.
 * Property keys live where the co-author spec list renders (Phase 4).
 */

/** Areas reachable via the `g`-prefix navigation chords. */
export type NavDestination = "inbox" | "next" | "triage" | "planning" | "review";

export interface ShortcutHandlers {
  onCapture?: () => void;
  onGoHome?: () => void;
  onNavigate?: (dest: NavDestination) => void;
  onToggleCheatsheet?: () => void;
  onCloseOverlay?: () => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  // The `g`-prefix for two-key nav chords (g i, g n, …). Lives in a ref so the
  // window listener can read/write it without re-binding. Cleared by: a matching
  // second key, any non-matching key, Esc, or a ~750ms timeout (so a stray `g`
  // doesn't leave the prefix armed indefinitely).
  const prefixRef = useRef<"g" | null>(null);
  const prefixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // ⌘K or ⌘/ — capture. Works everywhere (even in text fields). Two
      // chords reach the same place: ⌘K is the primary, ⌘/ the alt for muscle
      // memory from command-palette conventions. Bare `/` stays excluded — it
      // collides with browser quick-find and would fire while typing.
      if (meta && (e.key.toLowerCase() === "k" || e.key === "/")) {
        e.preventDefault();
        handlers.onCapture?.();
        return;
      }

      // ⌘? — cheatsheet (Cmd+Shift+/).
      // Up here because Cmd chords don't type text, so it works in fields
      // too. Locked 2026-06-22. (Bare `?` is handled below, typing-guarded.)
      if (meta && e.key === "?") {
        e.preventDefault();
        handlers.onToggleCheatsheet?.();
        return;
      }

      // Esc — always closes the topmost overlay. Never blocked by typing.
      // Also cancels any armed `g`-prefix so a stray prefix never lingers.
      if (e.key === "Escape") {
        prefixRef.current = null;
        handlers.onCloseOverlay?.();
        return;
      }

      // Below shortcuts are disabled while typing.
      if (isTypingTarget(e.target)) return;

      // Space — Next (home). Avoid hijacking button-activation space.
      if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        handlers.onGoHome?.();
        return;
      }

      // ? — cheatsheet (Shift+/). Only when not typing — Shift+/ in a field
      // types "?", so it must not steal the keystroke. The ⌘? shape above
      // covers the in-field case.
      if (e.key === "?") {
        e.preventDefault();
        handlers.onToggleCheatsheet?.();
        return;
      }

      // g-prefix navigation chords (vim-style): `g` arms a prefix, the next
      // key jumps to an area. Two keys = no collision with single-key shortcuts
      // or with typing (the whole block is past the typing guard, so `g` never
      // fires while composing text). Any non-matching second key cancels.
      const G_DEST: Record<string, NavDestination> = {
        i: "inbox",
        n: "next",
        t: "triage",
        p: "planning",
        r: "review",
      };
      const lower = e.key.toLowerCase();

      if (prefixRef.current === "g") {
        // A prefix is armed: dispatch on match, cancel on anything else.
        if (prefixTimerRef.current) clearTimeout(prefixTimerRef.current);
        prefixRef.current = null;
        const dest = G_DEST[lower];
        if (dest) {
          e.preventDefault();
          handlers.onNavigate?.(dest);
        }
        return;
      }

      // Arm the prefix on a bare `g`. A timeout cancels it if no second key
      // follows — so a lone `g` is a no-op rather than a stuck prefix.
      if (lower === "g") {
        e.preventDefault();
        prefixRef.current = "g";
        if (prefixTimerRef.current) clearTimeout(prefixTimerRef.current);
        prefixTimerRef.current = setTimeout(() => {
          prefixRef.current = null;
        }, 750);
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
