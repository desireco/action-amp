<script lang="ts">
  import { session } from "../stores/session.svelte";
</script>

<main class="auth">
  <h1>Link Garden</h1>
  <p class="sub">capture · triage · keep</p>
  <form onsubmit={(e) => { e.preventDefault(); void session.submit(); }}>
    {#if session.mode === "signup"}
      <input bind:value={session.name} placeholder="name" autocomplete="name" />
    {/if}
    <input bind:value={session.email} placeholder="email" type="email" autocomplete="email" />
    <input bind:value={session.password} placeholder="password" type="password" autocomplete="current-password" />
    <button type="submit" disabled={session.busy}>
      {session.mode === "signup" ? "Create account" : "Sign in"}
    </button>
  </form>
  {#if session.error}<p class="error">{session.error}</p>{/if}
  <button class="link" onclick={() => session.toggleMode()}>
    {session.mode === "signup" ? "have an account? sign in" : "new here? create an account"}
  </button>
</main>

<style>
  .auth {
    max-width: 20rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-top: 4rem;
    margin: 0 auto;
  }
  h1 {
    font-size: var(--aa-text-lg);
    font-weight: var(--aa-weight-semibold);
    margin: 0;
  }
  .sub {
    margin: 0 0 0.5rem;
    font-size: var(--aa-text-sm);
    opacity: 0.6;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  input {
    font: inherit;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--aa-border-strong);
    border-radius: 8px;
    background: var(--aa-bg-soft);
    color: inherit;
  }
  input:focus {
    outline: none;
    box-shadow: var(--aa-focus-ring);
  }
  button[type="submit"] {
    background: var(--aa-primary);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.5rem;
    cursor: pointer;
    font-weight: var(--aa-weight-medium);
  }
  .link {
    background: none;
    border: none;
    color: var(--aa-primary);
    cursor: pointer;
    font-size: var(--aa-text-sm);
    padding: 0;
    text-align: left;
  }
  .error {
    color: var(--aa-amber-text, var(--aa-amber));
    font-size: var(--aa-text-sm);
    margin: 0;
  }
</style>
