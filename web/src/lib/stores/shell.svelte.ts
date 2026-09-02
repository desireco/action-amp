/**
 * Shell state: the modal mode axis (docs/INTERACTION.md §2–§3).
 *
 * Store pattern (copied from the spike, to be copied by every later slice):
 * a class with `$state` fields + plain methods, exported as a singleton from
 * a `*.svelte.ts` module. Components read `shell.mode` reactively in runes
 * expressions (`$derived`, templates) and mutate only through methods — no
 * writable stores, no prop drilling.
 *
 * Modes are renderings, not pages (INTERACTION §1): Plan / Work / Review are
 * three renderings of the same Mode × Scope card position. Names follow
 * docs/WORKFLOW.md §4 (Work / Planning / Review); keys follow the
 * INTERACTION §2 dial (1 = Plan, 2 = Do, 3 = Review).
 */

export type Mode = "plan" | "work" | "review";

export interface ModeInfo {
  id: Mode;
  /** Dial key (INTERACTION §2). */
  key: string;
  label: string;
  /** One-line purpose, from WORKFLOW §4. */
  blurb: string;
}

/** Ordered by dial position (1/2/3). */
export const MODES: ModeInfo[] = [
  { id: "plan", key: "1", label: "Plan", blurb: "Organize: arrange projects, goals, Someday." },
  { id: "work", key: "2", label: "Work", blurb: "Execute: pick the Next task, start it, finish it." },
  { id: "review", key: "3", label: "Review", blurb: "Reflect: metrics, completion history, stuck items." },
];

class ShellStore {
  /** Active mode. `work` is the home base — Esc always lands here. */
  mode = $state<Mode>("work");
  /** `?` cheatsheet visibility (INTERACTION §6 — always discoverable). */
  keysHint = $state(false);

  setMode(mode: Mode) {
    this.mode = mode;
    this.keysHint = false;
  }

  /** Esc — universal exit (INTERACTION §6): return to the home base. */
  reset() {
    this.mode = "work";
    this.keysHint = false;
  }

  toggleKeysHint() {
    this.keysHint = !this.keysHint;
  }

  info(): ModeInfo {
    return MODES.find((m) => m.id === this.mode) ?? MODES[1];
  }
}

export const shell = new ShellStore();
