/**
 * Search/command-palette store — the global overlay state (S9).
 *
 * Store pattern (the capture.svelte convention): a class with `$state` fields
 * + plain methods, exported as a singleton from a `*.svelte.ts` module.
 *
 * The palette is GLOBAL (webapp AppShell parity): one overlay component, two
 * entry intents — `/` opens Search, `⌘\`/Ctrl+\ opens Command. Mounting lives
 * in +layout.svelte (the integrator's wiring line — see
 * docs/plans/slices/s9-wiring.md); until that line lands, e2e mounts it
 * temporarily there.
 *
 * Blocking parity (webapp AppShell's isPaletteBlocked inputs, re-derived from
 * this stack's own state): focus mode and triage are routes (`/do/focus`,
 * `/do/inbox/review`), capture is the capture store's open flag, the
 * cheatsheet is the shell store's keysHint. ⌘K capture is intentionally NOT
 * blocked in focus mode — the focus-protector lives in the capture store.
 */
import { get } from "svelte/store";
import { page } from "$app/stores";
import { client } from "../api";
import { capture, type LensInfo } from "./capture.svelte";
import { shell } from "./shell.svelte";
import { isPaletteBlocked } from "../components/search/paletteAvailability";

export type CommandPaletteMode = "search" | "command";

class SearchStore {
  /** Overlay visibility + the intent it was opened with. */
  open = $state(false);
  mode = $state<CommandPaletteMode>("search");
  /** Whole-account Pro capability (webapp shell's `entitled` flag). */
  entitled = $state(true);
  /** Lenses for the palette's switch-lens entries (lens chip colors). */
  lenses = $state<LensInfo[]>([]);
  contextLoaded = $state(false);

  /**
   * Open + prefetch the entitlement flag and lenses (AppShell parity — the
   * FREE gate renders without firing the search queries; a failed prefetch
   * opens the palette anyway and the queries answer 402 as the backstop).
   */
  async show(mode: CommandPaletteMode) {
    if (this.blocked) return;
    this.mode = mode;
    this.open = true;
    if (this.contextLoaded) return;
    this.contextLoaded = true;
    try {
      const [entitlement, lenses] = await Promise.all([
        client.search.entitlement(),
        client.inbox.lenses(),
      ]);
      this.entitled = entitlement.entitled;
      this.lenses = lenses;
    } catch {
      // Calm degradation: keep the prior state; the queries' own 402/401 is
      // the backstop.
      this.contextLoaded = false;
    }
  }

  hide() {
    this.open = false;
  }

  /** Blocking overlays/modes win (webapp AppShell parity, new-stack inputs). */
  get blocked(): boolean {
    const path = get(page).url.pathname;
    return isPaletteBlocked({
      working: path.startsWith("/do/focus"),
      triage: path.startsWith("/do/inbox/review"),
      capture: capture.open,
      shortcuts: shell.keysHint,
      confirmation: false, // logout confirm — no shell surface yet
      feedback: false, // feedback dialog — S13
      mobileLens: false, // mobile lens popover — with the shell
      palette: this.open,
    });
  }

  /**
   * The global palette keys (webapp useKeyboardShortcuts parity):
   *   ⌘\ / Ctrl+\ — Command intent. Works EVERYWHERE, even in text fields
   *   (`e.code === "Backslash"`, chords above the typing guard).
   *   /           — Search intent. Plain slash only, BELOW the typing guard
   *   so it never steals text from inputs/editors.
   */
  onGlobalKey(event: KeyboardEvent): void {
    if (
      (event.metaKey || event.ctrlKey) &&
      (event.code === "Backslash" || event.key === "\\")
    ) {
      event.preventDefault();
      void this.show("command");
      return;
    }
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      void this.show("search");
    }
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

export const search = new SearchStore();
