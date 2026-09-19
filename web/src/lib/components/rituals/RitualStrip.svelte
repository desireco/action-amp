<script lang="ts">
  /**
   * RitualStrip — the quiet "Rituals" section on Today (WORKFLOW.md §2.3):
   * the day's due Rituals, grouped by daily interval — morning → midday →
   * evening — then order, each row with its lens pill. Outside todayCap by
   * construction; renders nothing when no ritual is due or the account is
   * FREE (Pro-only, no free-tier count).
   *
   * Row interaction mirrors task rows: focusable, Enter/Space on an
   * unchecked row opens the reflection dialog; the CompletionCircle checks
   * (unchecked → dialog) / unchecks (checked → one direct tap, no modal —
   * the entry and its reflection are deleted). Tapping a checked row's name
   * reopens the reflection for view/edit.
   */
  import "../../styles/rituals.css";
  import CompletionCircle from "../ui/CompletionCircle.svelte";
  import RitualReflectionDialog from "./RitualReflectionDialog.svelte";
  import Markdown from "../logbook/Markdown.svelte";
  import {
    INTERVAL_LABELS,
    cadenceLabel,
    rituals,
    type RitualMood,
    type TodayRitual,
  } from "../../stores/rituals.svelte";

  let dialogRitual = $state<TodayRitual | null>(null);

  $effect(() => {
    void rituals.loadToday();
  });

  const groups = $derived.by(() => {
    const due = rituals.today;
    if (due.length === 0) return [];
    return (["MORNING", "MIDDAY", "EVENING"] as const)
      .map((interval) => ({
        interval,
        rows: due.filter((r) => r.interval === interval),
      }))
      .filter((g) => g.rows.length > 0);
  });

  /** A small neutral glyph for a recorded mood — never colored. */
  function moodGlyph(mood: RitualMood): string {
    return mood === "HAPPY" ? "▲" : mood === "NEGATIVE" ? "▼" : "●";
  }

  function onRowKeydown(event: KeyboardEvent, row: TodayRitual) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    dialogRitual = row;
  }

  function onCircle(row: TodayRitual) {
    if (row.checked) {
      void rituals.uncheck(row.id);
    } else {
      dialogRitual = row;
    }
  }

  async function onConfirm(mood: RitualMood | null, note: string) {
    const target = dialogRitual;
    if (!target) return;
    dialogRitual = null;
    await rituals.complete(target.id, mood, note);
  }
</script>

{#if groups.length > 0}
  <section class="aa-ritual-strip" aria-label="Rituals">
    <div class="aa-ritual-strip__header">
      <span>Rituals</span>
      <span class="aa-ritual-strip__count">{rituals.today.length}</span>
    </div>

    {#each groups as group (group.interval)}
      <div class="aa-ritual-strip__group">
        <div class="aa-ritual-strip__interval">{INTERVAL_LABELS[group.interval]}</div>
        <ul class="aa-ritual-strip__list">
          {#each group.rows as row (row.id)}
            <!-- The TaskRow idiom: a focusable, keyed div row (a role=button
                 li would nest buttons inside a button role). -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
            <div
              class="aa-ritual-strip__row {row.checked ? "aa-ritual-strip__row--done" : ""}"
              tabindex="0"
              onclick={() => (dialogRitual = row)}
              onkeydown={(e) => onRowKeydown(e, row)}
            >
              <!-- The wrapper stops the row's open-dialog click so a checked
                   circle is exactly one uncheck tap. -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <span
                class="aa-ritual-strip__circle"
                role="presentation"
                onclick={(e) => e.stopPropagation()}
              >
                <CompletionCircle filled={row.checked} onclick={() => onCircle(row)} />
              </span>
              <span class="aa-ritual-strip__name">{row.name}</span>
              {#if row.guidance}
                <!-- (g) — hover (or focus) shows the guidance, markdown-rendered. -->
                <span
                  class="aa-ritual-strip__hint"
                  tabindex="0"
                  title="Guidance"
                  aria-label="Guidance: {row.guidance}"
                >
                  (g)
                  <span class="aa-ritual-strip__hint-pop" role="tooltip">
                    <span class="aa-ritual-strip__hint-tag">Guidance</span>
                    <Markdown text={row.guidance} />
                  </span>
                </span>
              {/if}
              {#if row.benefit}
                <span
                  class="aa-ritual-strip__hint"
                  tabindex="0"
                  title="Benefit"
                  aria-label="Benefit: {row.benefit}"
                >
                  (b)
                  <span class="aa-ritual-strip__hint-pop" role="tooltip">
                    <span class="aa-ritual-strip__hint-tag">Benefit</span>
                    <Markdown text={row.benefit} />
                  </span>
                </span>
              {/if}
              {#if row.checked && row.mood}
                <span
                  class="aa-ritual-strip__mood"
                  title="Recorded mood"
                  aria-label="Mood: {row.mood.toLowerCase()}">{moodGlyph(row.mood)}</span
                >
              {/if}
              {#if row.lensName}
                <span class="aa-ritual-strip__lens" title="Lens: {row.lensName}">
                  <span class="aa-ritual-strip__lens-name">{row.lensName}</span>
                </span>
              {/if}
              <span class="aa-ritual-strip__cadence">{cadenceLabel(row)}</span>
            </div>
          {/each}
        </ul>
      </div>
    {/each}
  </section>
{/if}

{#if dialogRitual}
  <RitualReflectionDialog
    name={dialogRitual.name}
    initialMood={dialogRitual.mood}
    initialNote={dialogRitual.note ?? ""}
    onConfirm={onConfirm}
    onClose={() => (dialogRitual = null)}
  />
{/if}
