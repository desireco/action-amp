import { useEffect } from "react";

/**
 * Global keyboard shortcuts for ActionAmp.
 *
 * Wired in App.tsx so they work across every authenticated route. Each handler
 * is a no-op when the user is typing in an input/textarea/contenteditable
 * (except Esc, which always works to close overlays).
 *
 * Navigation uses one grammar: Shift + the first letter of the destination.
 * Capital chords never collide with triage's lowercase p/r dispatch, and Shift
 * doesn't type into inputs the way bare letters do. Captures the lot in a
 * single, memorable rule.
 *
 *   ⌘K           → open capture popover (always works, even in text fields)
 *   ⌘\\           → open command palette (always works, even in text fields)
 *   /            → open sitewide search (outside text fields)
 *   ⌘L           → toggle the lens switcher (always works; ⌘-chords don't type)
 *   Shift+I/N/T/G/P/R → jump to Inbox / Next / Today / TriaGe / Planning / Review
 *   Shift+C      → capture (typing-safe; ⌘K remains the focus-protector)
 *   ? · ⌘?       → toggle the shortcut cheatsheet
 *   Esc          → close any open overlay (cheatsheet, capture, focus mode)
 *
 * Context-specific shortcuts (triage 1/2/3/P/R/Del, focus F) are scoped to
 * their own pages, not here.
 */

/** Areas reachable via the Shift-letter navigation chords. */
export type NavDestination =
  "inbox" | "next" | "today" | "triage" | "planning" | "review";

export interface ShortcutHandlers {
  onCapture?: () => void;
  onSearch?: () => void;
  onCommandPalette?: () => void;
  onGoHome?: () => void;
  onNavigate?: (dest: NavDestination) => void;
  onToggleCheatsheet?: () => void;
  onToggleLens?: () => void;
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // ⌘K — capture. Works everywhere (even in text fields).
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onCapture?.();
        return;
      }

      // ⌘\ / Ctrl+\ — command palette. Works in fields like capture.
      if (meta && (e.code === "Backslash" || e.key === "\\")) {
        e.preventDefault();
        handlers.onCommandPalette?.();
        return;
      }

      // ⌘L — toggle the lens switcher popover (only meaningful at ≥4 lenses,
      // where the segmented control becomes a chip + popover). Sits with the
      // other ⌘-chords, above the typing guard, so it fires in fields too —
      // matches ⌘K. Browser default for ⌘L is "focus the location bar"; we
      // preventDefault so the app owns it inside the authed shell.
      if (meta && e.key.toLowerCase() === "l") {
        e.preventDefault();
        handlers.onToggleLens?.();
        return;
      }

      // ⌘? — cheatsheet (Cmd+Shift+/).
      // Up here because Cmd chords don't type text, so it works in fields
      // too. (Bare `?` is handled below, typing-guarded.)
      if (meta && e.key === "?") {
        e.preventDefault();
        handlers.onToggleCheatsheet?.();
        return;
      }

      // Esc — always closes the topmost overlay. Never blocked by typing.
      if (e.key === "Escape") {
        handlers.onCloseOverlay?.();
        return;
      }

      // Below shortcuts are disabled while typing.
      if (isTypingTarget(e.target)) return;

      // / — sitewide search. Kept below the typing guard so slash remains a
      // normal character in inputs, textareas, selects, and editors.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      // Shift + letter → navigation + capture. One grammar: Shift + the first
      // letter of the destination. Capitals never clash with triage's lowercase
      // p/r, and Shift doesn't type into fields (the typing guard above is a
      // belt-and-suspenders backstop). `e.shiftKey && e.key.length === 1` keys
      // off the shifted glyph so this only matches true Shift+letter presses,
      // not Shift+arrow/Shift+symbol.
      if (e.shiftKey && e.key.length === 1) {
        const SHIFT_NAV: Record<string, NavDestination> = {
          I: "inbox",
          N: "next",
          T: "today",
          G: "triage", // triaGe
          P: "planning",
          R: "review",
        };
        const dest = SHIFT_NAV[e.key.toUpperCase()];
        if (dest) {
          e.preventDefault();
          handlers.onNavigate?.(dest);
          return;
        }
        // Shift+C → capture (typing-safe convenience; ⌘K stays the always-works
        // focus-protector).
        if (e.key.toUpperCase() === "C") {
          e.preventDefault();
          handlers.onCapture?.();
          return;
        }
      }

      // ? — cheatsheet (Shift+/). Only when not typing — Shift+/ in a field
      // types "?", so it must not steal the keystroke. The ⌘? shape above
      // covers the in-field case.
      if (e.key === "?") {
        e.preventDefault();
        handlers.onToggleCheatsheet?.();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
