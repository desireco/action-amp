import type { ReactNode, KeyboardEvent } from "react";

/**
 * Keyboard helpers for the modal/composer family. The "submit on ⌘/Ctrl+Enter"
 * convention is shared by FeedbackDialog, FocusMode's note composer, and
 * RecordComposer — centralize the predicate + the kbd chip so they stay in
 * sync. Plain Enter is always left alone (these are multi-line textareas).
 */

/** True when the event is ⌘Enter (Mac) or Ctrl+Enter (Win/Linux). */
function isModEnter<T extends Element>(e: KeyboardEvent<T>): boolean {
  return e.key === "Enter" && (e.metaKey || e.ctrlKey);
}

/**
 * Calls `submit` when the event is ⌘/Ctrl+Enter, preventDefault-ing so the
 * textarea doesn't also insert a newline. Returns whether it fired.
 */
export function submitOnModEnter<T extends Element>(
  e: KeyboardEvent<T>,
  submit: () => void,
): boolean {
  if (!isModEnter(e)) return false;
  e.preventDefault();
  submit();
  return true;
}

/**
 * Kbd — the visual chip used in hints ("press <Kbd>n</Kbd> to add a note").
 * Wraps the existing `.aa-kbd` class so styling stays in one place.
 */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="aa-kbd">{children}</kbd>;
}
