<script lang="ts">
  // /signup — the same passwordless flow, creation-framed (the SignupRoute
  // port). Same server ops as /login: verifying a code creates the account.
  import PasswordlessAuthPage from "../../lib/components/auth/PasswordlessAuthPage.svelte";
</script>

<PasswordlessAuthPage mode="signup">
  {#snippet footer()}
    <span>
      By creating an account, you agree to our
      <a href="https://actionamp.com/terms">Terms</a> and
      <a href="https://actionamp.com/privacy">Privacy Policy</a>.
    </span>
    <span>
      Already have an account? <a href="/login">Log in</a>
    </span>
    <span>
      Proudly <a href="https://dakic.com">Built By Dakic</a>.
    </span>
  {/snippet}
</PasswordlessAuthPage>
