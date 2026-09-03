<script lang="ts">
  // Account — who you are, and how to leave. Ported from
  // webapp/src/app/SettingsPage.tsx. Minimal on purpose.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import ConfirmDialog from "../../../lib/components/ui/ConfirmDialog.svelte";
  import Field from "../../../lib/components/settings/Field.svelte";
  import { logout } from "../../../lib/auth";
  import { prefs } from "../../../lib/stores/prefs.svelte";
  import { APP_VERSION } from "../../../lib/version";

  let fullName = $state("");
  let preferredName = $state("");
  let profileStatus = $state<"idle" | "saving" | "saved">("idle");
  let profileError = $state<string | null>(null);
  let confirmLogout = $state(false);

  onMount(() => {
    void prefs.loadAccount().then((account) => {
      if (!account) return;
      fullName = account.fullName ?? "";
      preferredName = account.preferredName || account.firstName || "";
    });
  });

  const account = $derived(prefs.account);
  const email = $derived(account?.email ?? null);
  const profileChanged = $derived(
    !!account &&
      (fullName.trim() !== (account.fullName ?? "") ||
        preferredName.trim() !== (account.preferredName || account.firstName || "")),
  );

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    profileStatus = "saving";
    profileError = null;
    try {
      await prefs.saveProfile(fullName, preferredName);
      await prefs.loadAccount();
      // Re-sync the local draft with the saved row ("Saved." only shows while
      // the form matches the server — the webapp's refetch() equivalence).
      preferredName = prefs.account?.preferredName || prefs.account?.firstName || "";
      profileStatus = "saved";
    } catch (err) {
      profileStatus = "idle";
      profileError = err instanceof Error ? err.message : "Could not save profile.";
    }
  }

  async function logOut() {
    // The real session end (webapp logout() parity): the API deletes the
    // Session row and clears the httpOnly cookie; landing on /login matches
    // the webapp, which drops logged-out users on the login screen.
    confirmLogout = false;
    await logout();
    await goto("/login", { replaceState: true });
  }
</script>

<section class="aa-settings-section">
  <div class="aa-settings-section-head">
    <h2 class="aa-settings-sh">Profile</h2>
    <p class="aa-settings-note">This name shows in the app shell and personalizes focus copy.</p>
  </div>
  <form class="aa-settings-form" onsubmit={saveProfile}>
    <Field label="Full name" description="Used for your account and avatar initials.">
      <input
        class="aa-settings-input"
        type="text"
        bind:value={fullName}
        oninput={() => (profileStatus = "idle")}
        autocomplete="name"
        disabled={!account || profileStatus === "saving"}
      />
    </Field>
    <Field label="Display name" description="Short name ActionAmp can use in calmer copy.">
      <input
        class="aa-settings-input"
        type="text"
        bind:value={preferredName}
        oninput={() => (profileStatus = "idle")}
        autocomplete="given-name"
        disabled={!account || profileStatus === "saving"}
      />
    </Field>
    <div class="aa-settings-actions">
      {#if profileError}<p class="aa-settings-error">{profileError}</p>{/if}
      {#if profileStatus === "saved" && !profileChanged}
        <p class="aa-settings-success">Saved.</p>
      {/if}
      <button
        type="submit"
        class="aa-settings-btn"
        disabled={!profileChanged || profileStatus === "saving"}
      >
        {profileStatus === "saving" ? "Saving" : "Save changes"}
      </button>
    </div>
  </form>
</section>

<section class="aa-settings-section">
  <div class="aa-settings-section-head">
    <h2 class="aa-settings-sh">Sign-in</h2>
    <p class="aa-settings-note">
      Email identifies the account. We send a fresh sign-in code when you log in.
    </p>
  </div>
  <Field
    label="Email address"
    description={email ? "Primary sign-in email." : "No email login attached."}
    value={email ?? "Not connected"}
  />
</section>

<section class="aa-settings-section">
  <div class="aa-settings-section-head">
    <h2 class="aa-settings-sh">Session</h2>
    <p class="aa-settings-note">End this browser session.</p>
  </div>
  <Field label="Signed in as" value={email ?? account?.fullName ?? "This account"}>
    <button type="button" class="aa-settings-btn" onclick={() => (confirmLogout = true)}>
      Log out
    </button>
  </Field>
</section>

<section class="aa-settings-section">
  <div class="aa-settings-section-head">
    <h2 class="aa-settings-sh">About</h2>
    <p class="aa-settings-note">Build identifier — useful when reporting an issue.</p>
  </div>
  <Field label="Version" value={APP_VERSION} />
  <Field label="Built By">
    {#snippet valueSnippet()}
      <a href="https://dakic.com">Dakic</a>
    {/snippet}
  </Field>
</section>

{#if confirmLogout}
  <ConfirmDialog
    title="Log out?"
    message="You'll be signed out and return to the login page."
    confirmLabel="Log out"
    cancelLabel="Stay"
    danger
    onConfirm={logOut}
    onClose={() => (confirmLogout = false)}
  />
{/if}
