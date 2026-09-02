/**
 * Onboarding store — the S13 client (F9a class-singleton pattern, mirroring
 * prefs.svelte.ts): the first-run gate's status read, the /welcome carousel's
 * ops, and the once-per-session `ensureOnboarded` bootstrap (the webapp's
 * AppShell call, ref-guarded against StrictMode double-fire).
 *
 * The optimistic-completion rule is load-bearing (s13-onboarding/README.md
 * §5): the gate reads the same server flag `completeOnboarding` writes, so
 * `complete()` patches the cached status IN PLACE before navigating — the
 * webapp patched the ["auth/me"] query cache for the same reason — and the
 * caller must NEVER navigate on a failed completion (a false flag would
 * bounce the user straight back to /welcome: a redirect loop).
 *
 * `status` is the useAuth parity shim (see packages/contract/src/onboarding.ts):
 * S10's future auth/me supersedes the fields; the gate + carousel read here.
 */
import { client } from "../api";
import type { OnboardingStage, OnboardingStatus } from "@actionamp/contract";

interface OnboardingClientSlice {
  ensureOnboarded(): Promise<{ createdLenses: { name: string; id: string }[] }>;
  setPreferredName(input: {
    preferredName: string;
  }): Promise<{ preferredName: string }>;
  completeOnboarding(input: {
    skipGuidance?: boolean;
  }): Promise<{ hasSeenOnboarding: boolean }>;
  status(): Promise<OnboardingStatus>;
}

const rpc = (client as unknown as { onboarding: OnboardingClientSlice })
  .onboarding;

class OnboardingStore {
  /** The gate read — null until first loaded (resolving). */
  status = $state<OnboardingStatus | null>(null);
  /** True once a status read answered (success OR 401 — the gate must not
   *  spin on unauthenticated visitors). */
  resolved = $state(false);
  /** True when a status read answered 401 (no session) — gate goes inert. */
  unauthenticated = $state(false);
  completing = $state(false);
  completionError = $state(false);

  #ensured = false;
  #loading: Promise<void> | null = null;

  /** Load the status once; concurrent callers share the in-flight promise. */
  load(): Promise<void> {
    if (this.resolved) return Promise.resolve();
    this.#loading ??= (async () => {
      try {
        this.status = await rpc.status();
        this.unauthenticated = false;
      } catch {
        // No session (401) is the expected "not applicable" case; treat any
        // failure as "gate inert" — never bounce a visitor off a page.
        this.unauthenticated = true;
      } finally {
        this.resolved = true;
        this.#loading = null;
      }
    })();
    return this.#loading;
  }

  /**
   * The idempotent bootstrap (default lenses + General projects + the sample
   * task when the stage asks for it) — once per session, ref-guarded. The
   * server core is check-then-create, so the guard is what keeps a
   * double-mount from seeding twice.
   */
  ensureOnboarded(): void {
    if (this.#ensured) return;
    this.#ensured = true;
    void rpc.ensureOnboarded().catch(() => {
      // Retry next session; the app shell works without the seed until then.
      this.#ensured = false;
    });
  }

  /** The name step. Save failures are swallowed — onboarding must never block
   *  on a network hiccup; the name is re-editable in Settings. */
  async setPreferredName(preferredName: string, fallback?: string): Promise<void> {
    const name = preferredName.trim() || fallback;
    if (!name) return;
    try {
      await rpc.setPreferredName({ preferredName: name });
      if (this.status) this.status.preferredName = name;
    } catch {
      /* non-fatal (webapp parity) */
    }
  }

  /**
   * Complete onboarding. Returns true ONLY on server success. On success the
   * cached status is patched optimistically (hasSeenOnboarding + the next
   * stage) so the gate doesn't bounce the user back to /welcome. On failure
   * the caller STAYS on the panel and offers retry — never navigate.
   */
  async complete(skipGuidance: boolean): Promise<boolean> {
    this.completing = true;
    this.completionError = false;
    try {
      await rpc.completeOnboarding({ skipGuidance });
    } catch {
      this.completing = false;
      this.completionError = true;
      return false;
    }
    if (this.status) {
      this.status.hasSeenOnboarding = true;
      this.status.onboardingStage = (
        skipGuidance ? "COMPLETE" : "SAMPLE_TASK"
      ) as OnboardingStage;
    } else {
      this.status = {
        hasSeenOnboarding: true,
        onboardingStage: skipGuidance ? "COMPLETE" : "SAMPLE_TASK",
        firstName: "",
        preferredName: null,
      };
    }
    this.completing = false;
    return true;
  }
}

export const onboarding = new OnboardingStore();
