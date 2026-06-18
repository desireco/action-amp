import { useEffect } from "react";

/**
 * Global keyboard shortcuts for ActionAmp.
 *
 * Wired in App.tsx so they work across every authenticated route. Each handler
 * is a no-op when the user is typing in an input/textarea/contenteditable
 * (except Esc, which always works to close overlays).
 *
 * Shortcuts (FEATURES.md §6):
 *   ⌘K / /        → open capture popover
 *   Space         → go to What Now (home)
 *   ?             → toggle the shortcut cheatsheet
 *   Esc           → close any open overlay (cheatsheet, capture, focus mode)
 *
 * Context-specific shortcuts (triage 1/2/3/P/R/Del, focus F) are scoped to
 * their own pages, not here.
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

      // ⌘K (or /) — capture. Works everywhere (even in fields for ⌘K; /
      // only when not typing).
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onCapture?.();
        return;
      }
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        handlers.onCapture?.();
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

      // ? — cheatsheet (Shift + /)
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
