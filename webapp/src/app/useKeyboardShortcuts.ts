import { useEffect } from "react";

/**
 * Global keyboard shortcuts for ActionAmp.
 *
 * Wired in App.tsx so they work across every authenticated route. Each handler
 * is a no-op when the user is typing in an input/textarea/contenteditable
 * (except Esc, which always works to close overlays).
 *
 * Shortcuts (FEATURES.md §6):
 *   ⌘/ · ⌘K     → open capture popover (⌘/ primary, ⌘K silent alias)
 *   Space         → go to What Now (home)
 *   ? · ⌘?        → toggle the shortcut cheatsheet (same physical key as ⌘/)
 *   Esc           → close any open overlay (cheatsheet, capture, focus mode)
 *
 * Context-specific shortcuts (triage 1/2/3/P/R/Del + the property keys
 * `[`/`]`/`-`/`=`, focus F) are scoped to their own pages, not here.
 * Property keys live where the co-author spec list renders (Phase 4).
 */
export interface ShortcutHandlers {
  onCapture?: () => void;
  onGoHome?: () => void;
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // ⌘/ or ⌘K — capture. Works everywhere (even in text fields).
      // ⌘/ is primary (locked 2026-06-22); ⌘K kept as silent alias for
      // muscle memory. Bare `/` retired (Firefox quick-find conflict).
      if (meta && (e.key === "/" || e.key.toLowerCase() === "k")) {
        e.preventDefault();
        handlers.onCapture?.();
        return;
      }

      // ⌘? — cheatsheet (Cmd+Shift+/, same physical key as ⌘/ capture).
      // Up here because Cmd chords don't type text, so it works in fields
      // too. Locked 2026-06-22. (Bare `?` is handled below, typing-guarded.)
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

      // Space — What Now (home). Avoid hijacking button-activation space.
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
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
