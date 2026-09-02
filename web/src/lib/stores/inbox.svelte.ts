/**
 * Inbox store (S3) — the queue snapshot semantics the triage wizard depends
 * on. The list screen reads `items` live; the review wizard takes a FIXED
 * snapshot on first arrival so post-dispatch invalidations can't shift
 * indices or skip items (the race guard webapp's TriagePage encoded).
 */

import { client } from "../api";

/** Wire shape of /rpc/inbox/list (InboxItemSchema). */
export interface InboxItem {
  id: string;
  text: string;
  title: string | null;
  content: string | null;
  sourceUrl: string | null;
  status: "UNPROCESSED" | "ARCHIVED";
  createdAt: string;
  attachments: { id: string; filename: string; mimeType: string }[];
  parsedScheduledDate: string | null;
  parsedSnoozedUntil: string | null;
  parsedPriority: "LOW" | "NORMAL" | "IMPORTANT" | null;
  parsedSize: "S" | "M" | "L" | "XL" | null;
  parsedTags: string[];
  parsedProject: string | null;
  parsedLens: string | null;
  parsedProjectId: string | null;
  parsedLensId: string | null;
}

class InboxStore {
  items = $state<InboxItem[]>([]);
  busy = $state(false);
  loaded = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      this.items = await client.inbox.list();
      this.loaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
    }
  }

  /**
   * The walkthrough queue: the current list ROTATED so item `startIdx` is
   * first (a row click seeds triage at that item without narrowing the
   * queue — once the newer items are specified, it wraps to the earlier
   * ones, so a session always drains everything that was waiting).
   */
  snapshot(startIdx: number): InboxItem[] {
    const queue = this.items;
    if (queue.length === 0 || startIdx === 0) return [...queue];
    const pivot = Math.min(startIdx, queue.length);
    return [...queue.slice(pivot), ...queue.slice(0, pivot)];
  }
}

export const inbox = new InboxStore();
