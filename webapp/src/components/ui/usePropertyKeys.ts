import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------
 * usePropertyKeys — the property-key shortcuts (TRIAGE.md §7.4 / §7.6).
 *
 * The canonical property keys, scoped to surfaces that host PropertyChips
 * (triage spec step, task page, later: expanded-capture editor). Lowercase,
 * no modifiers — they never clash with the global Shift-letter nav.
 *
 *   [  / ]    size down / up   (S ↔ M ↔ L ↔ XL)
 *   -  / =    priority down/up (Low ↔ Normal ↔ Important)
 *   H         cycle When       (Today → Upcoming → Someday → Today)
 *
 * Guards: no-op when `enabled` is false, when focus is in an
 * INPUT/TEXTAREA/SELECT/[contenteditable], or when a meta key is held. The
 * caller toggles `enabled` to suppress during open popovers (PropertyChips
 * exposes its open state via onOpenChange).
 * ------------------------------------------------------------------ */

const SIZE_ORDER = ["S", "M", "L", "XL"] as const;
const PRIORITY_ORDER = ["LOW", "NORMAL", "IMPORTANT"] as const;
const WHEN_ORDER = ["TODAY", "UPCOMING", "SOMEDAY"] as const;

/** The fields the hook can read + write. Strings/uppercase to match both the
 *  task model and triage's Working draft (callers normalize at the boundary). */
export interface PropertyKeyValues {
  status: string;
  priority: string;
  size: string;
}

export interface PropertyKeyPatch {
  status?: string;
  priority?: string;
  size?: string;
}

interface UsePropertyKeysArgs {
  enabled: boolean;
  /** Read current values. Called on every keydown so the hook always sees the
   *  freshest state without re-binding the listener. */
  get: () => PropertyKeyValues;
  /** Apply a patch. */
  set: (patch: PropertyKeyPatch) => void;
}

function cycle(value: string, order: readonly string[], step: 1 | -1): string {
  const idx = order.indexOf(value);
  if (idx === -1) return order[0];
  const next = (idx + step + order.length) % order.length;
  return order[next];
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

export function usePropertyKeys({ enabled, get, set }: UsePropertyKeysArgs) {
  // Keep latest get/set in a ref so the listener (bound once) always reads
  // fresh values without re-attaching on every render.
  const stateRef = useRef({ enabled, get, set });
  stateRef.current = { enabled, get, set };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { enabled, get, set } = stateRef.current;
      if (!enabled) return;
      // Ignore when the user is typing in a text field — these keys are
      // legitimate input characters there.
      if (isTypingTarget(e.target)) return;
      // Ignore modifier chords (the global nav uses Shift+letter; don't fight).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const v = get();
      switch (e.key) {
        case "[":
          e.preventDefault();
          set({ size: cycle(v.size, SIZE_ORDER, -1) });
          return;
        case "]":
          e.preventDefault();
          set({ size: cycle(v.size, SIZE_ORDER, 1) });
          return;
        case "-":
          e.preventDefault();
          set({ priority: cycle(v.priority, PRIORITY_ORDER, -1) });
          return;
        case "=":
        case "+": // = and + share a key on US layouts
          e.preventDefault();
          set({ priority: cycle(v.priority, PRIORITY_ORDER, 1) });
          return;
        case "h":
        case "H":
          e.preventDefault();
          set({ status: cycle(v.status, WHEN_ORDER, 1) });
          return;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
