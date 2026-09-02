<script lang="ts">
  import "../app.css";
  import "../lib/tokens.css";
  let { children } = $props();
</script>

<!-- Single screen container: the app is modal — modes re-render in place,
     navigation never spawns new chrome around this container. -->
<div class="screen-container">
  {@render children()}
</div>

<style>
  .screen-container {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
</style>
