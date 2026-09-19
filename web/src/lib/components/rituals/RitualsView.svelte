<script lang="ts">
  /**
   * RitualsView — the /rituals Planning surface (WORKFLOW.md §2.4):
   * lens-scoped management like Projects — inline create (name + interval +
   * cadence; lens defaults to Me, changeable), edit, pause, archive. No
   * check-off here — checking happens in Today's Rituals section. Rows show
   * an interval label and a cadence chip; the goal attribution appears when
   * linked. ProGate'd for FREE (whole-feature gate, no free-tier count).
   */
  import { untrack } from "svelte";
  import "../../styles/projects.css";
  import "../../styles/goals.css";
  import "../../styles/rituals.css";
  import {
    INTERVAL_LABELS,
    cadenceLabel,
    rituals,
    type Ritual,
    type RitualCadence,
    type RitualHistoryEntry,
    type RitualInterval,
  } from "../../stores/rituals.svelte";
  import { lenses } from "../../stores/lenses.svelte";
  import { goals } from "../../stores/goals.svelte";
  import type { GateMessage } from "../../stores/projects.svelte";
  import ProGate from "../ui/ProGate.svelte";
  import ListEmpty from "../ui/ListEmpty.svelte";
  import Button from "../ui/Button.svelte";
  import Chip from "../ui/Chip.svelte";
  import Icon from "../ui/Icon.svelte";
  import PickerSheet from "../ui/PickerSheet.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Markdown from "../logbook/Markdown.svelte";

  const INTERVALS: RitualInterval[] = ["MORNING", "MIDDAY", "EVENING"];
  const CADENCES: { value: RitualCadence; label: string }[] = [
    { value: "DAILY", label: "Every day" },
    { value: "WEEKDAYS", label: "Weekdays" },
    { value: "WEEKLY", label: "Weekly" },
    { value: "INTERVAL", label: "Every N days" },
  ];
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  let creating = $state(false);
  let submitting = $state(false);
  let gate = $state<GateMessage | null>(null);
  let createError = $state<string | null>(null);
  let name = $state("");
  let interval = $state<RitualInterval>("MORNING");
  let cadence = $state<RitualCadence>("DAILY");
  let weekday = $state<number | null>(null);
  let intervalDays = $state<number | null>(null);
  let guidance = $state("");
  let benefit = $state("");
  // Creation defaults the lens to Me (the included lens) — changeable here.
  let lensId = $state<string | null>(null);
  let lensPickerOpen = $state(false);
  let goalId = $state<string | null>(null);

  let editing = $state<Ritual | null>(null);
  let editName = $state("");
  let editInterval = $state<RitualInterval>("MORNING");
  let editCadence = $state<RitualCadence>("DAILY");
  let editWeekday = $state<number | null>(null);
  let editIntervalDays = $state<number | null>(null);
  let editGuidance = $state("");
  let editBenefit = $state("");
  let editGoalId = $state<string | null>(null);
  let editError = $state<string | null>(null);

  // Per-row history toggle (the quiet day list; evidence only).
  let historyFor = $state<string | null>(null);
  let historyRows = $state<RitualHistoryEntry[]>([]);

  // The Archived section — collapsed by default, one quiet toggle.
  let archivedOpen = $state(false);
  // The delete confirmation (destructive, archived rows only).
  let deleteTarget = $state<Ritual | null>(null);

  // Drag-and-drop reorder (HTML5 DnD; the drop writes order = index).
  let dragId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);

  /** One-tap starting points — prefill the composer, nothing more. */
  const EXAMPLES: { label: string; name: string; interval: RitualInterval; guidance?: string; benefit?: string }[] = [
    {
      label: "Journaling",
      name: "Journaling",
      interval: "EVENING",
      guidance: "Ten minutes, three bullets, **no editing**",
      benefit: "Clears the noise before sleep",
    },
    {
      label: "Gratitude",
      name: "Gratitude",
      interval: "EVENING",
      guidance: "Write **one thing** that went well and why",
      benefit: "Ends the day on evidence, not worry",
    },
    { label: "Medication", name: "Medication", interval: "MORNING" },
    { label: "Morning walk", name: "Morning walk", interval: "MORNING" },
  ];

  function startExample(example: (typeof EXAMPLES)[number]) {
    creating = true;
    name = example.name;
    interval = example.interval;
    cadence = "DAILY";
    weekday = null;
    intervalDays = null;
    guidance = example.guidance ?? "";
    benefit = example.benefit ?? "";
    lensId = null;
    goalId = null;
  }

  async function toggleHistory(id: string) {
    if (historyFor === id) {
      historyFor = null;
      return;
    }
    historyFor = id;
    historyRows = await rituals.history(id);
  }

  function onDrop(targetId: string) {
    const from = dragId;
    dragId = null;
    dragOverId = null;
    if (!from || from === targetId) return;
    const ids = rituals.rituals.map((r) => r.id);
    const fromIndex = ids.indexOf(from);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    ids.splice(toIndex, 0, ...ids.splice(fromIndex, 1));
    void rituals.reorder(ids);
  }

  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  const blocked = $derived(rituals.blocked);
  const activeLensName = $derived(
    lensId
      ? (lenses.lenses.find((l) => l.id === lensId)?.name ?? "Me")
      : (rituals.meLensId
          ? (lenses.lenses.find((l) => l.id === rituals.meLensId)?.name ?? "Me")
          : "Me"),
  );
  const resolvedLensId = $derived(lensId ?? rituals.meLensId);

  $effect(() => {
    void lenses.activeLensId;
    untrack(() => {
      void rituals.load();
      // Active goals for the link picker + row attribution.
      if (lenses.activeLensId) void goals.loadLens(lenses.activeLensId);
    });
  });

  const goalById = $derived(new Map(goals.lensGoals.map((g) => [g.id, g.name])));

  const showEmptyState = $derived(rituals.loaded && rituals.rituals.length === 0 && !creating);

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault();
    if (submitting || !resolvedLensId) return;
    submitting = true;
    gate = null;
    createError = null;
    const result = await rituals.create({
      name,
      lensId: resolvedLensId,
      interval,
      cadence,
      weekday: cadence === "WEEKLY" ? weekday : null,
      intervalDays: cadence === "INTERVAL" ? intervalDays : null,
      guidance: guidance || null,
      benefit: benefit || null,
      goalId: goalId ?? null,
    });
    submitting = false;
    if (!result.ok) {
      gate = result.gate;
      if (!gate) createError = result.message;
      return;
    }
    creating = false;
    name = "";
    interval = "MORNING";
    cadence = "DAILY";
    weekday = null;
    intervalDays = null;
    guidance = "";
    benefit = "";
    lensId = null;
    goalId = null;
  }

  function startEdit(row: Ritual) {
    editing = row;
    editName = row.name;
    editInterval = row.interval;
    editCadence = row.cadence;
    editWeekday = row.weekday;
    editIntervalDays = row.intervalDays;
    editGuidance = row.guidance ?? "";
    editBenefit = row.benefit ?? "";
    editGoalId = row.goalId ?? null;
    editError = null;
  }

  async function handleUpdate(event: SubmitEvent) {
    event.preventDefault();
    if (!editing) return;
    editError = await rituals.update({
      id: editing.id,
      name: editName,
      interval: editInterval,
      cadence: editCadence,
      weekday: editCadence === "WEEKLY" ? editWeekday : null,
      intervalDays: editCadence === "INTERVAL" ? editIntervalDays : null,
      guidance: editGuidance || null,
      benefit: editBenefit || null,
      goalId: editGoalId,
    });
    if (!editError) editing = null;
  }

  const lensItems = $derived(
    lenses.lenses.map((l) => ({ id: l.id, label: l.name, current: l.id === resolvedLensId })),
  );

  const goalItems = $derived([
    { id: "", label: "None", current: !goalId },
    ...goals.lensGoals.map((g) => ({ id: g.id, label: g.name, current: g.id === goalId })),
  ]);

  const editGoalItems = $derived([
    { id: "", label: "None", current: !editGoalId },
    ...goals.lensGoals.map((g) => ({ id: g.id, label: g.name, current: g.id === editGoalId })),
  ]);
</script>

<div class="aa-rituals">
  <header class="aa-list-header">
    <div>
      <div class="aa-list-header__eyebrow">Planning</div>
      <h1 class="aa-list-header__title">Rituals</h1>
      <p class="aa-list-header__description">
        {#if blocked}
          The rhythms that shouldn't need a decision.
        {:else if rituals.busy && !rituals.loaded}
          Loading rituals…
        {:else}
          {rituals.rituals.length} active · The rhythms that shouldn't need a decision.
        {/if}
      </p>
    </div>
    {#if !blocked}
      <button type="button" class="aa-create-control" onclick={() => (creating = !creating)}>
        <span class="aa-create-control__mark" aria-hidden="true">
          <Icon name="check" size={15} />
          <span class="aa-create-control__plus"></span>
        </span>
        {creating ? "Close" : "New ritual"}
      </button>
    {/if}
  </header>

  {#if blocked}
    <ProGate feature="Rituals" reason="keep daily rhythms, separate from tasks, with Pro" />
  {:else}
    {#if creating}
      <form class="aa-composer" onsubmit={handleCreate}>
        <h2 class="aa-composer__title">New ritual</h2>
        <p class="aa-composer__subtitle">The things that shouldn't need a decision.</p>
        <label class="aa-field">
          Ritual
          <input use:focusOnMount bind:value={name} placeholder="Morning walk" />
        </label>
        <label class="aa-field">
          Guidance <span class="aa-rituals__field-hint">what you do</span>
          <input bind:value={guidance} placeholder="Ten minutes, three bullets, no editing" maxlength="500" />
        </label>
        <label class="aa-field">
          Benefit <span class="aa-rituals__field-hint">what you get</span>
          <input bind:value={benefit} placeholder="Clears the noise before the day starts" maxlength="500" />
        </label>

        <div class="aa-rituals__field">
          <span class="aa-rituals__field-label">Time of day</span>
          <div class="aa-rituals__segmented" role="radiogroup" aria-label="Interval">
            {#each INTERVALS as option (option)}
              <button
                type="button"
                class="aa-rituals__segment {interval === option ? "aa-rituals__segment--on" : ""}"
                role="radio"
                aria-checked={interval === option}
                onclick={() => (interval = option)}
              >
                {INTERVAL_LABELS[option]}
              </button>
            {/each}
          </div>
        </div>

        <div class="aa-rituals__field">
          <span class="aa-rituals__field-label">Repeats</span>
          <div class="aa-rituals__segmented" role="radiogroup" aria-label="Cadence">
            {#each CADENCES as option (option.value)}
              <button
                type="button"
                class="aa-rituals__segment {cadence === option.value ? "aa-rituals__segment--on" : ""}"
                role="radio"
                aria-checked={cadence === option.value}
                onclick={() => (cadence = option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
          {#if cadence === "WEEKLY"}
            <div class="aa-rituals__segmented" role="radiogroup" aria-label="Day of the week">
              {#each WEEKDAYS as label, index (label)}
                <button
                  type="button"
                  class="aa-rituals__segment aa-rituals__segment--day {weekday === index ? "aa-rituals__segment--on" : ""}"
                  role="radio"
                  aria-checked={weekday === index}
                  onclick={() => (weekday = index)}
                >
                  {label}
                </button>
              {/each}
            </div>
          {:else if cadence === "INTERVAL"}
            <label class="aa-field aa-rituals__interval-input">
              Every
              <input
                type="number"
                min="2"
                max="365"
                bind:value={intervalDays}
              />
              days
            </label>
          {/if}
        </div>

        <div class="aa-rituals__field">
          <span class="aa-rituals__field-label">Lens</span>
          <button
            type="button"
            class="aa-rituals__picker-button"
            onclick={() => (lensPickerOpen = true)}
          >
            {activeLensName}
          </button>
        </div>

        <div class="aa-rituals__field">
          <span class="aa-rituals__field-label">Goal <span class="aa-rituals__field-hint">the why at all — optional</span></span>
          <div class="aa-rituals__segmented aa-rituals__goal-choices" role="radiogroup" aria-label="Goal">
            {#each goalItems as g (g.id || "none")}
              <button
                type="button"
                class="aa-rituals__segment {g.current ? "aa-rituals__segment--on" : ""}"
                role="radio"
                aria-checked={g.current}
                onclick={() => (goalId = g.id || null)}
              >
                {g.label}
              </button>
            {/each}
          </div>
        </div>

        {#if createError}
          <p class="aa-error" role="alert">{createError}</p>
        {/if}
        <div class="aa-composer__actions">
          <button type="button" class="aa-btn aa-btn--secondary" onclick={() => (creating = false)}>
            Cancel
          </button>
          <button type="submit" class="aa-btn aa-btn--primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create ritual"}
          </button>
        </div>
      </form>
    {/if}

    {#if showEmptyState}
      <ListEmpty
        title="No rituals yet."
        text="Rituals are the rhythms that shouldn't need a decision. They check off in Today and never compete with commitments."
      >
        {#snippet action()}
          <div class="aa-rituals__examples">
            <span class="aa-rituals__examples-label">Start with</span>
            <div class="aa-rituals__examples-row">
              {#each EXAMPLES as example (example.label)}
                <button
                  type="button"
                  class="aa-rituals__segment"
                  onclick={() => startExample(example)}
                >
                  {example.label}
                </button>
              {/each}
            </div>
          </div>
        {/snippet}
      </ListEmpty>
    {/if}

    {#if rituals.rituals.length > 0}
      <ul class="aa-rituals__list">
        {#each rituals.rituals as row (row.id)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li
            class="aa-rituals__row {row.paused ? "aa-rituals__row--paused" : ""}
              {dragOverId === row.id && dragId !== row.id ? "aa-rituals__row--drag-over" : ""}
              {dragId === row.id ? "aa-rituals__row--dragging" : ""}"
            draggable={editing?.id !== row.id ? "true" : undefined}
            ondragstart={(e) => {
              dragId = row.id;
              e.dataTransfer?.setData("text/plain", row.id);
              e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
            }}
            ondragover={(e) => {
              e.preventDefault();
              dragOverId = row.id;
            }}
            ondragleave={() => (dragOverId = dragOverId === row.id ? null : dragOverId)}
            ondrop={(e) => {
              e.preventDefault();
              onDrop(row.id);
            }}
            ondragend={() => {
              dragId = null;
              dragOverId = null;
            }}
          >
            {#if editing?.id === row.id}
              <form class="aa-rituals__edit" onsubmit={handleUpdate}>
                <label class="aa-field">
                  Ritual
                  <input bind:value={editName} />
                </label>
                <label class="aa-field">
                  Guidance <span class="aa-rituals__field-hint">what you do</span>
                  <input bind:value={editGuidance} maxlength="500" />
                </label>
                <label class="aa-field">
                  Benefit <span class="aa-rituals__field-hint">what you get</span>
                  <input bind:value={editBenefit} maxlength="500" />
                </label>
                <div class="aa-rituals__field">
                  <span class="aa-rituals__field-label">Time of day</span>
                  <div class="aa-rituals__segmented" role="radiogroup" aria-label="Interval">
                    {#each INTERVALS as option (option)}
                      <button
                        type="button"
                        class="aa-rituals__segment {editInterval === option ? "aa-rituals__segment--on" : ""}"
                        role="radio"
                        aria-checked={editInterval === option}
                        onclick={() => (editInterval = option)}
                      >
                        {INTERVAL_LABELS[option]}
                      </button>
                    {/each}
                  </div>
                </div>
                <div class="aa-rituals__field">
                  <span class="aa-rituals__field-label">Repeats</span>
                  <div class="aa-rituals__segmented" role="radiogroup" aria-label="Cadence">
                    {#each CADENCES as option (option.value)}
                      <button
                        type="button"
                        class="aa-rituals__segment {editCadence === option.value ? "aa-rituals__segment--on" : ""}"
                        role="radio"
                        aria-checked={editCadence === option.value}
                        onclick={() => (editCadence = option.value)}
                      >
                        {option.label}
                      </button>
                    {/each}
                  </div>
                  {#if editCadence === "WEEKLY"}
                    <div class="aa-rituals__segmented" role="radiogroup" aria-label="Day of the week">
                      {#each WEEKDAYS as label, index (label)}
                        <button
                          type="button"
                          class="aa-rituals__segment aa-rituals__segment--day {editWeekday === index ? "aa-rituals__segment--on" : ""}"
                          role="radio"
                          aria-checked={editWeekday === index}
                          onclick={() => (editWeekday = index)}
                        >
                          {label}
                        </button>
                      {/each}
                    </div>
                  {:else if editCadence === "INTERVAL"}
                    <label class="aa-field aa-rituals__interval-input">
                      Every
                      <input type="number" min="2" max="365" bind:value={editIntervalDays} />
                      days
                    </label>
                  {/if}
                </div>
                <div class="aa-rituals__field">
                  <span class="aa-rituals__field-label">Goal <span class="aa-rituals__field-hint">optional</span></span>
                  <div class="aa-rituals__segmented aa-rituals__goal-choices" role="radiogroup" aria-label="Goal">
                    {#each editGoalItems as g (g.id || "none")}
                      <button
                        type="button"
                        class="aa-rituals__segment {g.current ? "aa-rituals__segment--on" : ""}"
                        role="radio"
                        aria-checked={g.current}
                        onclick={() => (editGoalId = g.id || null)}
                      >
                        {g.label}
                      </button>
                    {/each}
                  </div>
                </div>
                {#if editError}
                  <p class="aa-error" role="alert">{editError}</p>
                {/if}
                <div class="aa-composer__actions">
                  <Button variant="secondary" size="sm" onclick={() => (editing = null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit">Save</Button>
                </div>
              </form>
            {:else}
              <div class="aa-rituals__row-main">
                <div class="aa-rituals__row-copy">
                  <div class="aa-rituals__row-head">
                    <span class="aa-rituals__row-name">{row.name}</span>
                    <span class="aa-rituals__row-meta">
                      <Chip variant="muted" small>{INTERVAL_LABELS[row.interval]}</Chip>
                      <span class="aa-rituals__row-cadence">{cadenceLabel(row)}</span>
                      {#if row.goalId}
                        <span class="aa-rituals__row-goal" title="Linked goal">
                          <Icon name="star" size={11} />
                          {goalById.get(row.goalId) ?? "Goal"}
                        </span>
                      {/if}
                      {#if row.paused}
                        <Chip variant="muted" small>Paused</Chip>
                      {/if}
                    </span>
                  </div>
                  {#if row.guidance}
                    <div class="aa-rituals__row-def aa-rituals__row-def--g">
                      <span class="aa-rituals__def-tag" aria-hidden="true">g</span>
                      <Markdown text={row.guidance} />
                    </div>
                  {/if}
                  {#if row.benefit}
                    <div class="aa-rituals__row-def aa-rituals__row-def--b">
                      <span class="aa-rituals__def-tag" aria-hidden="true">b</span>
                      <Markdown text={row.benefit} />
                    </div>
                  {/if}
                </div>
              </div>
              <div class="aa-rituals__row-actions">
                <button
                  type="button"
                  class="aa-btn aa-btn--ghost"
                  aria-expanded={historyFor === row.id}
                  onclick={() => void toggleHistory(row.id)}
                >
                  History
                </button>
                <button type="button" class="aa-btn aa-btn--ghost" onclick={() => startEdit(row)}>
                  Edit
                </button>
                <button
                  type="button"
                  class="aa-btn aa-btn--ghost"
                  onclick={() => void rituals.setPaused(row.id, !row.paused)}
                >
                  {row.paused ? "Resume" : "Pause"}
                </button>
                <button type="button" class="aa-btn aa-btn--ghost" onclick={() => void rituals.archive(row.id)}>
                  Archive
                </button>
              </div>
            {/if}
            {#if historyFor === row.id}
              <div class="aa-rituals__history">
                {#if historyRows.length === 0}
                  <p class="aa-rituals__history-empty">No checks recorded yet.</p>
                {:else}
                  <ul class="aa-rituals__history-list">
                    {#each historyRows as entry (entry.localDate)}
                      <li>
                        <span class="aa-rituals__history-date">{entry.localDate}</span>
                        {#if entry.mood}
                          <span class="aa-rituals__history-mood" aria-label="Mood: {entry.mood.toLowerCase()}">
                            {entry.mood === "HAPPY" ? "▲" : entry.mood === "NEGATIVE" ? "▼" : "●"}
                          </span>
                        {/if}
                        {#if entry.note}
                          <span class="aa-rituals__history-note">{entry.note}</span>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Archived — the very bottom of the page. -->
    {#if rituals.archivedRows.length > 0}
      <section class="aa-rituals__archived" aria-label="Archived rituals">
        <button
          type="button"
          class="aa-rituals__archived-toggle"
          aria-expanded={archivedOpen}
          onclick={() => (archivedOpen = !archivedOpen)}
        >
          Archived
          <span class="aa-rituals__archived-count">{rituals.archivedRows.length}</span>
          <span class="aa-rituals__archived-hint">{archivedOpen ? "Hide" : "Show"}</span>
        </button>
        {#if archivedOpen}
          <ul class="aa-rituals__archived-list">
            {#each rituals.archivedRows as row (row.id)}
              <li class="aa-rituals__archived-row">
                <span class="aa-rituals__archived-name">{row.name}</span>
                <span class="aa-rituals__row-cadence">
                  {INTERVAL_LABELS[row.interval].toLowerCase()} · {cadenceLabel(row)}
                </span>
                <span class="aa-rituals__row-actions">
                  <button
                    type="button"
                    class="aa-btn aa-btn--ghost"
                    onclick={() => void toggleHistory(row.id)}
                  >
                    History
                  </button>
                  <button
                    type="button"
                    class="aa-btn aa-btn--ghost"
                    onclick={() => void rituals.restore(row.id)}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    class="aa-btn aa-btn--ghost"
                    onclick={() => (deleteTarget = row)}
                  >
                    Delete
                  </button>
                </span>
                {#if historyFor === row.id}
                  <div class="aa-rituals__history">
                    {#if historyRows.length === 0}
                      <p class="aa-rituals__history-empty">No checks recorded.</p>
                    {:else}
                      <ul class="aa-rituals__history-list">
                        {#each historyRows as entry (entry.localDate)}
                          <li>
                            <span class="aa-rituals__history-date">{entry.localDate}</span>
                            {#if entry.mood}
                              <span class="aa-rituals__history-mood" aria-label="Mood: {entry.mood.toLowerCase()}">
                                {entry.mood === "HAPPY" ? "▲" : entry.mood === "NEGATIVE" ? "▼" : "●"}
                              </span>
                            {/if}
                            {#if entry.note}
                              <span class="aa-rituals__history-note">{entry.note}</span>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  {/if}
</div>

{#if deleteTarget}
  <ConfirmDialog
    title="Delete ritual"
    message={`This permanently deletes '${deleteTarget.name}' and its recorded history. This cannot be undone.`}
    confirmLabel="Delete"
    danger={true}
    onConfirm={() => {
      void rituals.remove(deleteTarget!.id);
      deleteTarget = null;
    }}
    onClose={() => (deleteTarget = null)}
  />
{/if}

{#if lensPickerOpen}
  <PickerSheet
    title="Lens"
    items={lensItems}
    onPick={(id) => {
      lensId = id;
      lensPickerOpen = false;
    }}
    onClose={() => (lensPickerOpen = false)}
  />
{/if}
