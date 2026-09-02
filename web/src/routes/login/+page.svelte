<script lang="ts">
  // /login — passwordless email sign-in (the LoginRoute port). Public.
  // Dev builds add the local autologin panel + the ?devEmail= shortcut.
  import PasswordlessAuthPage from "../../lib/components/auth/PasswordlessAuthPage.svelte";
  import { APP_VERSION } from "../../lib/version";
</script>

<PasswordlessAuthPage mode="login" showDevAutologin>
  {#snippet footer()}
    <span>
      See our <a href="https://actionamp.com/terms">Terms</a> and
      <a href="https://actionamp.com/privacy">Privacy Policy</a>.
    </span>
    <span>
      Proudly <a href="https://dakic.com">Built By Dakic</a>.
    </span>
    <span class="aa-auth-version">v{APP_VERSION}</span>
  {/snippet}
</PasswordlessAuthPage>
