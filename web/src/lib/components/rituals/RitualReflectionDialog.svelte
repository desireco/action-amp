<script lang="ts">
  /**
   * RitualReflectionDialog — the completion reflection ("How did it go?",
   * docs/specs/rituals.md): three moods + a note, ALL optional, one large
   * Complete button (always enabled — completing with nothing entered is a
   * valid check), X/Esc exits without saving. Doubles as the edit view over
   * a checked row (mood + note pre-filled; Complete saves, X discards).
   *
   * Built on the confirm-dialog overlay pattern (INTERACTION.md §9.4 — the
   * shared Overlays.css shell + real Button primitives). Keyboard: 1/2/3
   * pick a mood, Enter confirms, Esc closes.
   */
  import "../../styles/rituals.css";
  import Button from "../ui/Button.svelte";
  import CloseButton from "../ui/CloseButton.svelte";
  import type { RitualMood } from "../../stores/rituals.svelte";

  let {
    name,
    initialMood = null,
    initialNote = "",
    onConfirm,
    onClose,
  }: {
    name: string;
    initialMood?: RitualMood | null;
    initialNote?: string;
    /** Fires with whatever was entered (both nullable — nothing required). */
    onConfirm: (mood: RitualMood | null, note: string) => void;
    onClose: () => void;
  } = $props();

  // Seeded ONCE from props — the dialog edits a copy; X discards it.
  // svelte-ignore state_referenced_locally
  let mood = $state<RitualMood | null>(initialMood);
  // svelte-ignore state_referenced_locally
  let note = $state(initialNote);

  // "Good / Okay / Rough" — the enum stays HAPPY | NEUTRAL | NEGATIVE.
  const MOODS: { value: RitualMood; label: string; key: string }[] = [
    { value: "HAPPY", label: "Good", key: "1" },
    { value: "NEUTRAL", label: "Okay", key: "2" },
    { value: "NEGATIVE", label: "Rough", key: "3" },
  ];

  // The three faces (stroke, currentColor — 16px grid, app icon style):
  // circle head, dot eyes, and the mouth carries the mood.
  const FACE_PATHS: Record<RitualMood, string> = {
    HAPPY: "M4.5 9.5c.9 1.4 2.1 2.2 3.5 2.2s2.6-.8 3.5-2.2",
    NEUTRAL: "M4.8 11h6.4",
    NEGATIVE: "M4.5 11.5c.9-1.4 2.1-2.2 3.5-2.2s2.6.8 3.5 2.2",
  };

  function confirm() {
    onConfirm(mood, note);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      confirm();
      return;
    }
    const picked = MOODS.find((m) => m.key === event.key);
    if (picked) {
      event.preventDefault();
      mood = picked.value;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div class="aa-overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Complete ritual" onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="aa-overlay-card aa-overlay-card--sm aa-ritual-dialog" onclick={(e) => e.stopPropagation()}>
    <div class="aa-ritual-dialog__head">
      <h2 class="aa-ritual-dialog__name">{name}</h2>
      <CloseButton onClose={onClose} />
    </div>

    <p class="aa-ritual-dialog__question">How did it go?</p>

    <div class="aa-ritual-dialog__moods" role="radiogroup" aria-label="Mood (optional)">
      {#each MOODS as m (m.value)}
        <button
          type="button"
          class="aa-ritual-dialog__mood {mood === m.value ? "aa-ritual-dialog__mood--on" : ""}"
          role="radio"
          aria-checked={mood === m.value}
          onclick={() => (mood = mood === m.value ? null : m.value)}
        >
          <svg
            class="aa-ritual-dialog__mood-face"
            width="26"
            height="26"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3" />
            <circle cx="5.8" cy="6.4" r="0.9" fill="currentColor" />
            <circle cx="10.2" cy="6.4" r="0.9" fill="currentColor" />
            <path
              d={FACE_PATHS[m.value]}
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
          </svg>
          <span class="aa-ritual-dialog__mood-label">{m.label}</span>
          <span class="aa-ritual-dialog__mood-key" aria-hidden="true">{m.key}</span>
        </button>
      {/each}
    </div>

    <textarea
      class="aa-ritual-dialog__note"
      bind:value={note}
      rows="2"
      maxlength="500"
      placeholder="A note, if you want one"
    ></textarea>

    <div class="aa-ritual-dialog__foot">
      <Button variant="primary" size="md" onclick={confirm}>
        Complete
      </Button>
    </div>
  </div>
</div>
