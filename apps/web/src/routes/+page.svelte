<script lang="ts">
  import { createKeyHandler } from "../lib/keyboard";
  import { shell } from "../lib/stores/shell.svelte";
  import ModeScreen from "../lib/components/ModeScreen.svelte";
  import ModeIndicator from "../lib/components/ModeIndicator.svelte";
  import KeysFooter from "../lib/components/KeysFooter.svelte";

  // One global key handler wired to the shell store — the pattern every
  // later mode extends (mode-specific handlers layer on top of this one).
  const onKey = createKeyHandler({
    setMode: (mode) => shell.setMode(mode),
    reset: () => shell.reset(),
    toggleKeysHint: () => shell.toggleKeysHint(),
  });
</script>

<svelte:window onkeydown={onKey} />

<ModeScreen />
<KeysFooter />
<ModeIndicator />
