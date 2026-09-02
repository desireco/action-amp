/**
 * Onboarding store — the S13 client (F9a class-singleton pattern, mirroring
 * prefs.svelte.ts): the first-run gate's status read, the /welcome carousel's
 * ops, and the once-per-session `ensureOnboarded` bootstrap (the webapp's
 * AppShell call, ref-guarded against StrictMode double-fire).
 *
 * The gate read is the auth `me` session (lib/auth.ts fetchAuthUser — the
 * /api/auth/me REST twin), which carries hasSeenOnboarding + the name fields:
 * S10's `me` superseded S13's onboarding.status shim, exactly as the contract
 * note promised. The optimistic-completion rule is load-bearing
 * (s13-onboarding/README.md §5): the gate reads the same server flag
 * `completeOnboarding` writes, so `complete()` patches the cached status IN
 * PLACE before navigating — the webapp patched the ["auth/me"] query cache for
 * the same reason — and the caller must NEVER navigate on a failed completion
 * (a false flag would bounce the user straight back to /welcome: a redirect
 * loop).
 */
import { client } from "../api";
import { fetchAuthUser } from "../auth";

/** The gate's snapshot (the onboarding slice of the auth `me` read). */
export interface OnboardingSnapshot {
  hasSeenOnboarding: boolean;
  /** Local-only mirror of User.onboardingStage (the optimistic patch target;
   *  nothing reads it client-side — the server owns the real stage). */
  onboardingStage: "SAMPLE_TASK" | "CAPTURE" | "TRIAGE" | "COMPLETE";
  /** Drives the carousel's name step: shown only when blank. */
  firstName: string;
  preferredName: string | null;
}

interface OnboardingClientSlice {
  ensureOnboarded(): Promise<{ createdLenses: { name: string; id: string }[] }>;
  setPreferredName(input: {
    preferredName: string;
  }): Promise<{ preferredName: string }>;
  completeOnboarding(input: {
    skipGuidance?: boolean;
  }): Promise<{ hasSeenOnboarding: boolean }>;
}

const rpc = (client as unknown as { onboarding: OnboardingClientSlice })
  .onboarding;

class OnboardingStore {
  /** The gate read — null until first loaded (resolving). */
  status = $state<OnboardingSnapshot | null>(null);
  /** True once a status read answered (success OR signed-out — the gate must
   *  not spin on unauthenticated visitors). */
  resolved = $state(false);
  /** True when the session read answered signed-out — gate goes inert. */
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
        const user = await fetchAuthUser();
        this.status = user
          ? {
              hasSeenOnboarding: user.hasSeenOnboarding,
              onboardingStage: "COMPLETE",
              firstName: user.firstName,
              preferredName: user.preferredName,
            }
          : null;
        this.unauthenticated = !user;
      } catch {
        // A failed read is treated as "gate inert" — never bounce a visitor
        // off a page (the webapp's gate also rendered nothing without an
        // auth answer).
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
   * on a network hiccup; the name is re-editable in Settings. */
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
      this.status.onboardingStage = skipGuidance ? "COMPLETE" : "SAMPLE_TASK";
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
