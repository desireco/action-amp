<!--
  /do/admin — the AdminRedirectPage twin (webapp AdminRedirectPage.tsx):
  a replace-navigation to /do/admin/overview.
-->
<script lang="ts">
  import { goto } from "$app/navigation";

  $effect(() => {
    void goto("/do/admin/overview", { replaceState: true });
  });
</script>
