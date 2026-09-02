import type { Mode } from "./stores/shell.svelte";

export interface KeyActions {
  setMode(mode: Mode): void;
  /** Esc — universal exit to the home base. */
  reset(): void;
  toggleKeysHint(): void;
}

/**
 * The shell keymap, adapted from the spike's triage handler.
 * docs/INTERACTION.md §2–§3: `1`/`2`/`3` = Plan/Work/Review (the mode dial),
 * Esc = back to the home base, `?` = keyset cheatsheet.
 *
 * Rules encoded here (keep them when adding modes):
 * - Esc works everywhere, including text fields (cancel/blur first).
 * - Chord space (⌘K capture, ⌘L lens, ⌘\\ command …) is reserved even in
 *   text fields — the focus-protector rule (INTERACTION §3). No chords are
 *   wired yet; when they land, handle them before the typing guard.
 * - Plain single-key commands are suppressed while typing in an input,
 *   textarea, or contenteditable host (INTERACTION §3).
 */
export function createKeyHandler(actions: KeyActions) {
  return (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      actions.reset();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    switch (event.key) {
      case "1":
        actions.setMode("plan");
        break;
      case "2":
        actions.setMode("work");
        break;
      case "3":
        actions.setMode("review");
        break;
      case "?":
        actions.toggleKeysHint();
        break;
    }
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}
