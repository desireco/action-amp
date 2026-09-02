/**
 * Capture store — the global ⌘K overlay state (S2).
 *
 * Store pattern (the shell.svelte convention): a class with `$state` fields +
 * plain methods, exported as a singleton from a `*.svelte.ts` module.
 *
 * The overlay is GLOBAL (INTERACTION/WORKFLOW §2.1): mounted once by the root
 * +layout.svelte, opened from anywhere (⌘K, the FAB, `?capture=1`, the
 * empty-inbox CTA). The S3 route page's own mount is retired — the global one
 * covers every route.
 */

import { client } from "../api";

export interface ResolverProject {
  id: string;
  name: string;
  permalink: string;
  type: "STANDARD" | "SIMPLE_LIST";
  lensId: string;
  lensName: string | null;
  lensColor: string | null;
}

export interface LensInfo {
  id: string;
  name: string;
  color: string | null;
  isIncluded: boolean;
}

class CaptureStore {
  /** Overlay visibility (⌘K / FAB / `?capture=1` / empty-inbox CTA). */
  open = $state(false);
  /** Cross-lens project tuples for the `#` autocomplete (recent-first). */
  projects = $state<ResolverProject[]>([]);
  /** The user's lenses (custom names feed the [[ ]] preview + Classify). */
  lenses = $state<LensInfo[]>([]);
  submitting = $state(false);

  /** Open + prefetch the resolver source (single query site, like AppShell). */
  async show() {
    this.open = true;
    try {
      const [projects, lenses] = await Promise.all([
        client.inbox.projectsForResolver(),
        client.inbox.lenses(),
      ]);
      this.projects = projects;
      this.lenses = lenses;
    } catch {
      // The popover still opens — the autocomplete just stays empty until a
      // refetch. Calm degradation, same as webapp's failed prefetch.
    }
  }

  hide() {
    this.open = false;
  }

  /**
   * Persist a capture. Image attachments are S12 (share target) — the
   * text-only contract is what the ⌘K surface speaks.
   */
  async submit(text: string): Promise<void> {
    if (this.submitting) return;
    this.submitting = true;
    try {
      await client.inbox.create({
        text,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } finally {
      this.submitting = false;
    }
  }

  /**
   * The global capture keys (webapp useKeyboardShortcuts parity):
   *   ⌘K / Ctrl+K — open. Works EVERYWHERE, even in text fields; LOCKED.
   *   Shift+C     — typing-safe backup; only when not typing.
   */
  onGlobalKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      void this.show();
      return;
    }
    if (event.shiftKey && event.key === "C" && !event.metaKey && !event.ctrlKey) {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      void this.show();
    }
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

export const capture = new CaptureStore();
