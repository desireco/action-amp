/**
 * Feedback store — the submit side of the feedback dialog (F9a class-singleton
 * pattern). Ported from the webapp's three submitFeedback call sites
 * (AppShell's loudspeaker, TodayPage's + TaskDetailPage's done-task feedback):
 * one store, one context shape, so every trigger records identical metadata.
 *
 * Calls the contract's `feedback.submit` (POST /rpc/feedback/submit) through
 * the typed client — the input mirrors webapp SubmitFeedbackArgs 1:1 (message
 * + route/section/lens/userAgent/viewport/timezone).
 */
import { page } from "$app/state";
import { client } from "../api";
import { lenses } from "./lenses.svelte";
import { captureFeedbackContext } from "../feedback";

/** The completed task the feedback is about (null = general feedback). */
export interface FeedbackTarget {
  id: string;
  description: string;
}

class FeedbackStore {
  /** Dialog visibility. */
  open = $state(false);
  /** The done task being discussed (the webapp's feedbackTask). */
  target = $state<FeedbackTarget | null>(null);
  submitting = $state(false);

  /** Open for a completed task — messages get the webapp's done-task prefix. */
  showForTask(task: FeedbackTarget): void {
    this.target = task;
    this.open = true;
  }

  /** Open for general feedback (the shell's loudspeaker — AppShell parity). */
  show(): void {
    this.target = null;
    this.open = true;
  }

  hide(): void {
    this.open = false;
    this.target = null;
  }

  /**
   * Persist the feedback. Throws on failure — the dialog surfaces the error
   * and stays open (webapp parity: never lose a half-written report).
   */
  async submit(message: string): Promise<void> {
    if (this.submitting) return;
    const context = captureFeedbackContext(page.url);
    const lens = lenses.active;
    const prefixed = this.target
      ? `Done task feedback: ${this.target.description}\n\n${message}`
      : message;
    this.submitting = true;
    try {
      await client.feedback.submit({
        message: prefixed,
        ...context,
        lens: lens ? { id: lens.id, name: lens.name, color: lens.color } : null,
      });
    } finally {
      this.submitting = false;
    }
  }
}

export const feedback = new FeedbackStore();
