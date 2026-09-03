<script lang="ts">
  // Preferences — app behavior. Ported from webapp/src/app/PreferencesPage.tsx.
  // Theme toggle is live ([data-theme] + localStorage, client-only); Today cap
  // (stepper, dirty-only Save), focus session (25/45 commit-on-click), the
  // daily Today reminder, and the review toggles (optimistic + rollback) are
  // wired; "Completion sounds" and "Momentum" stay "soon" chips — honesty over
  // fake toggles.
  //
  // No settings-specific keyboard shortcuts (s11 notes §4) — mouse/tap only.
  import { onMount } from "svelte";
  import Chip from "../../../../lib/components/ui/Chip.svelte";
  import Field from "../../../../lib/components/settings/Field.svelte";
  import { prefs, systemTimeZone, FOCUS_SESSION_OPTIONS, TODAY_CAP_DEFAULT, TODAY_CAP_MIN, TODAY_CAP_MAX, FOCUS_SESSION_DEFAULT, type FocusSessionMinutes } from "../../../../lib/stores/prefs.svelte";
  import { enablePushSubscription } from "../../../../lib/push";
  import { applyTheme, preferredTheme, type AppTheme } from "../../../../lib/theme";

  // ---- Theme: live, persisted ----
  let theme = $state<AppTheme>("light");
  function toggleTheme(next: boolean) {
    theme = applyTheme(next ? "dark" : "light");
  }

  // ---- Data ----
  onMount(() => {
    // Apply (not just read) the persisted/system theme on entry — the webapp's
    // shell did applyTheme(preferredTheme()) at mount, so the toggle state and
    // the document agree even on a first visit that follows system preference.
    theme = applyTheme(preferredTheme());
    void prefs.loadNotifications();
    void prefs.loadPreferences().then((row) => {
      if (row) {
        draftCap = row.todayCap;
        reminderEnabled = prefs.notifications?.dailyReminderEnabled ?? false;
        reminderTime = prefs.notifications?.dailyReminderTime ?? "09:00";
      }
    });
  });

  const storedPrefs = $derived(prefs.preferences);
  const storedCap = $derived(storedPrefs?.todayCap ?? TODAY_CAP_DEFAULT);
  const storedFocusMinutes = $derived(storedPrefs?.focusSessionMinutes ?? FOCUS_SESSION_DEFAULT);
  const reviewPreferences = $derived(
    storedPrefs?.reviewPreferences ?? { today: true, week: true, month: true },
  );

  // ---- Focus session length (commit-on-click) ----
  let focusStatus = $state<"idle" | "saving" | "error">("idle");
  let focusError = $state<string | null>(null);

  async function commitFocusMinutes(minutes: FocusSessionMinutes) {
    if (minutes === storedFocusMinutes || focusStatus === "saving") return;
    focusStatus = "saving";
    focusError = null;
    try {
      await prefs.saveFocusSessionMinutes(minutes);
      await prefs.loadPreferences();
      focusStatus = "idle";
    } catch (error) {
      focusStatus = "error";
      focusError =
        error instanceof Error ? error.message : "Could not save focus session length.";
    }
  }

  // ---- Today cap (stepper, dirty-only Save) ----
  let draftCap = $state(storedCap);
  let capStatus = $state<"idle" | "saving" | "error">("idle");
  let capError = $state<string | null>(null);
  const capDirty = $derived(draftCap !== storedCap);

  // Sync the local draft when the server value changes (first load, post-save
  // refresh, or a change made elsewhere) — webapp PreferencesPage's
  // useEffect([storedCap]) parity.
  $effect(() => {
    draftCap = storedCap;
  });

  function clampCap(value: number): number {
    return Math.max(TODAY_CAP_MIN, Math.min(TODAY_CAP_MAX, Math.round(value)));
  }

  async function commitCap(value: number) {
    const clamped = clampCap(value);
    draftCap = clamped;
    if (clamped === storedCap) return;
    capStatus = "saving";
    capError = null;
    try {
      await prefs.saveTodayCap(clamped);
      await prefs.loadPreferences();
      capStatus = "idle";
    } catch (error) {
      capStatus = "error";
      capError = error instanceof Error ? error.message : "Could not save Today cap.";
    }
  }

  // ---- Daily Today reminder ----
  let reminderEnabled = $state(false);
  let reminderTime = $state("09:00");
  let notificationStatus = $state<"idle" | "saving" | "error">("idle");
  let notificationError = $state<string | null>(null);

  async function setDailyReminder(enabled: boolean, time = reminderTime) {
    notificationStatus = "saving";
    notificationError = null;
    try {
      if (enabled) {
        // The web push flow (webapp notifications/client + PreferencesPage):
        // browser support → VAPID key → permission → subscribe → save the
        // subscription. enablePushSubscription throws the webapp's exact
        // strings ("This browser does not support push notifications.",
        // "Notifications are not configured on this ActionAmp server yet.",
        // "Notification permission was not granted.", "Could not create
        // notification subscription.").
        if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
          throw new Error("This browser does not support push notifications.");
        }
        if (!prefs.notifications?.vapidPublicKey) {
          throw new Error("Notifications are not configured on this ActionAmp server yet.");
        }
        // S12 wiring: permission + pushManager.subscribe under the waiting
        // worker + savePushSubscription({endpoint, p256dh, auth}) — before
        // the saveDailyReminder below (webapp PreferencesPage parity).
        await enablePushSubscription(prefs.notifications.vapidPublicKey);
      }
      await prefs.saveDailyReminder(enabled, time, systemTimeZone());
      reminderEnabled = enabled;
      notificationStatus = "idle";
      await prefs.loadNotifications();
    } catch (error) {
      notificationStatus = "error";
      notificationError = error instanceof Error ? error.message : "Could not update reminders.";
    }
  }

  // ---- Reviews (optimistic with rollback) ----
  let reviewStatus = $state<"idle" | "saving" | "error">("idle");
  let reviewError = $state<string | null>(null);

  async function commitReviewPreference(
    cadence: "today" | "week" | "month",
    enabled: boolean,
  ) {
    const previous = reviewPreferences;
    const next = { ...reviewPreferences, [cadence]: enabled };
    // Optimistic: mutate the local mirror; roll back on a server failure.
    if (storedPrefs) {
      storedPrefs.reviewPreferences = next;
    }
    reviewStatus = "saving";
    reviewError = null;
    try {
      await prefs.saveReviewPreferences(next);
      reviewStatus = "idle";
    } catch (error) {
      if (storedPrefs) {
        storedPrefs.reviewPreferences = previous;
      }
      reviewStatus = "error";
      reviewError =
        error instanceof Error ? error.message : "Could not save review preferences.";
    }
  }
</script>

<section class="aa-settings-section">
  <h2 class="aa-settings-sh">Appearance</h2>
  <Field
    label="Dark mode"
    description="Switch the app to a dark theme. Respects your system setting on first visit."
    toggle={{ checked: theme === "dark", onChange: toggleTheme }}
  />
</section>

<section class="aa-settings-section">
  <h2 class="aa-settings-sh">Focus</h2>
  <Field
    label="Focus session"
    description="Choose the countdown used when you start a task. Each finished countdown is recorded separately from task completion."
  >
    <div
      class="aa-settings-choice"
      role="radiogroup"
      aria-label="Focus session length"
      aria-busy={focusStatus === "saving"}
    >
      {#each FOCUS_SESSION_OPTIONS as minutes (minutes)}
        <button
          type="button"
          role="radio"
          aria-checked={storedFocusMinutes === minutes}
          class="aa-settings-choice__option {storedFocusMinutes === minutes ? "is-selected" : ""}"
          onclick={() => void commitFocusMinutes(minutes)}
          disabled={focusStatus === "saving"}
        >
          {minutes} min
        </button>
      {/each}
    </div>
  </Field>
  {#if focusError}<p class="aa-settings-error">{focusError}</p>{/if}
</section>

<section class="aa-settings-section">
  <h2 class="aa-settings-sh">Today</h2>
  <Field
    label="Today cap"
    description={`Today is global across lenses. Cap the day's commitment between ${TODAY_CAP_MIN} and ${TODAY_CAP_MAX}. Default ${TODAY_CAP_DEFAULT}.`}
  >
    <div class="aa-settings-stepper" role="group" aria-label="Today cap">
      <button
        type="button"
        class="aa-settings-stepper__btn"
        onclick={() => void commitCap(draftCap - 1)}
        disabled={draftCap <= TODAY_CAP_MIN || capStatus === "saving"}
        aria-label="Decrease Today cap"
      >
        −
      </button>
      <input
        class="aa-settings-stepper__value"
        type="number"
        inputmode="numeric"
        min={TODAY_CAP_MIN}
        max={TODAY_CAP_MAX}
        step={1}
        value={draftCap}
        oninput={(e) => {
          const n = Number.parseInt(e.currentTarget.value, 10);
          draftCap = Number.isFinite(n) ? n : storedCap;
        }}
        onblur={(e) => void commitCap(Number.parseInt(e.currentTarget.value, 10) || storedCap)}
        disabled={capStatus === "saving"}
        aria-label="Today cap value"
      />
      <button
        type="button"
        class="aa-settings-stepper__btn"
        onclick={() => void commitCap(draftCap + 1)}
        disabled={draftCap >= TODAY_CAP_MAX || capStatus === "saving"}
        aria-label="Increase Today cap"
      >
        +
      </button>
      {#if capDirty && capStatus !== "saving"}
        <button type="button" class="aa-settings-stepper__save" onclick={() => void commitCap(draftCap)}>
          Save
        </button>
      {/if}
      {#if capStatus === "saving"}
        <Chip variant="muted" small>saving…</Chip>
      {/if}
    </div>
  </Field>
  {#if capError}<p class="aa-settings-error">{capError}</p>{/if}
  <Field
    label="Daily Today reminder"
    description="One quiet nudge at your chosen local time. It opens Today, Next, or Capture."
    toggle={{
      checked: reminderEnabled,
      onChange: (next) => void setDailyReminder(next),
      disabled: notificationStatus === "saving",
    }}
  />
  {#if reminderEnabled}
    <Field label="Reminder time" description="Uses this device's current time zone.">
      <input
        class="aa-settings-input"
        type="time"
        bind:value={reminderTime}
        onblur={() => void setDailyReminder(true)}
        disabled={notificationStatus === "saving"}
      />
    </Field>
  {/if}
  {#if notificationError}<p class="aa-settings-error">{notificationError}</p>{/if}
</section>

<section class="aa-settings-section">
  <div class="aa-settings-section-head">
    <h2 class="aa-settings-sh">Reviews</h2>
    <p class="aa-settings-note">
      Choose which reflection rhythms appear in Review. Turning one off hides it; it does not
      remove completed work or past reviews.
    </p>
  </div>
  <Field
    label="Today review"
    description="A short closure: every task, project, and goal completed today."
    toggle={{
      checked: reviewPreferences.today,
      onChange: (enabled) => void commitReviewPreference("today", enabled),
      disabled: reviewStatus === "saving",
    }}
  />
  <Field
    label="Week review"
    description="See where effort went and make decisions about loose work."
    toggle={{
      checked: reviewPreferences.week,
      onChange: (enabled) => void commitReviewPreference("week", enabled),
      disabled: reviewStatus === "saving",
    }}
  />
  <Field
    label="Month review"
    description="Celebrate goals, see the month’s shape, and choose future attention."
    toggle={{
      checked: reviewPreferences.month,
      onChange: (enabled) => void commitReviewPreference("month", enabled),
      disabled: reviewStatus === "saving",
    }}
  />
  {#if reviewError}<p class="aa-settings-error">{reviewError}</p>{/if}
</section>

<section class="aa-settings-section">
  <h2 class="aa-settings-sh">Feedback</h2>
  <Field label="Completion sounds" description="A soft sound when you complete a task. Off by default.">
    <Chip variant="muted" small>soon</Chip>
  </Field>
  <Field label="Momentum" description="A light 'X done today' counter. No badges, no guilt trips.">
    <Chip variant="muted" small>soon</Chip>
  </Field>
</section>
