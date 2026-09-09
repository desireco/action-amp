<!--
  /admin — the AdminRedirectPage twin (webapp AdminRedirectPage.tsx):
  a replace-navigation to /admin/overview.
-->
<script lang="ts">
  import { goto } from "$app/navigation";

  $effect(() => {
    void goto("/admin/overview", { replaceState: true });
  });
</script>
