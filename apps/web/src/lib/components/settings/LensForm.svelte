<script lang="ts">
  // LensForm — the create/edit lens form (webapp LensesPage.tsx LensForm):
  // name + optional purpose + the closed 8-key palette; "Changes save only
  // when you select Save changes." cue; server errors surfaced via
  // operationErrorMessage (data.reason → message → preamble).
  import { operationErrorMessage } from "../../stores/lenses.svelte";

  const PALETTE = [
    { key: "indigo", label: "Indigo" },
    { key: "emerald", label: "Emerald" },
    { key: "slate", label: "Slate" },
    { key: "cyan", label: "Cyan" },
    { key: "coral", label: "Coral" },
    { key: "honey", label: "Honey" },
    { key: "lime", label: "Lime" },
    { key: "magenta", label: "Magenta" },
  ] as const;

  let {
    initial,
    submit,
    submitLabel,
    submittingLabel,
    errorPreamble,
    namePlaceholder,
    autoFocusName = false,
    onCancel,
    onDelete,
    onDone,
  }: {
    initial: { name: string; purpose: string; color: string };
    submit: (vals: { name: string; purpose: string; color: string }) => Promise<void>;
    submitLabel: string;
    submittingLabel: string;
    errorPreamble: string;
    namePlaceholder?: string;
    autoFocusName?: boolean;
    onCancel: () => void;
    onDelete?: () => void;
    onDone: () => Promise<void>;
  } = $props();

  let name = $state(initial.name);
  let purpose = $state(initial.purpose);
  let color = $state(initial.color);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let nameEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (autoFocusName) nameEl?.focus();
  });

  async function save() {
    saving = true;
    error = null;
    try {
      await submit({ name, purpose, color });
      await onDone();
    } catch (e) {
      error = operationErrorMessage(e, errorPreamble);
    } finally {
      saving = false;
    }
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!saving && name.trim()) void save();
  }
</script>

<form class="aa-lenses-edit" data-lens-color={color || undefined} onsubmit={handleSubmit}>
  <header class="aa-lenses-edit__head">
    <div>
      <p class="aa-lenses-edit__eyebrow">{initial.name ? "Editing lens" : "New lens"}</p>
      <h3>{initial.name || "Create a new life context"}</h3>
    </div>
    <p>
      {#if initial.name}
        Changes save only when you select <strong>{submitLabel}</strong>.
      {:else}
        Your lens is created only when you select <strong>{submitLabel}</strong>.
      {/if}
    </p>
  </header>
  <div class="aa-lenses-edit__fields">
    <div class="aa-lenses-edit__row">
      <label class="aa-lenses-edit__label" for="lens-name">Name</label>
      <input
        bind:this={nameEl}
        id="lens-name"
        class="aa-lenses-edit__input"
        type="text"
        bind:value={name}
        placeholder={namePlaceholder}
        disabled={saving}
      />
    </div>
    <div class="aa-lenses-edit__row">
      <label class="aa-lenses-edit__label" for="lens-purpose">
        Purpose <span>Optional</span>
      </label>
      <input
        id="lens-purpose"
        class="aa-lenses-edit__input"
        type="text"
        bind:value={purpose}
        placeholder="What this lens is for"
        disabled={saving}
      />
    </div>
  </div>
  <div class="aa-lenses-edit__row">
    <span class="aa-lenses-edit__label">Color</span>
    <div class="aa-lenses-palette">
      {#each PALETTE as p (p.key)}
        <button
          type="button"
          class="aa-lenses-swatch {color === p.key ? "selected" : ""}"
          data-lens-color={p.key}
          onclick={() => (color = p.key)}
          aria-label={p.label}
          title={p.label}
        >
          <span class="aa-lenses-swatch__dot"></span>
        </button>
      {/each}
    </div>
  </div>
  {#if error}<p class="aa-lenses-error">{error}</p>{/if}
  <footer class="aa-lenses-edit__acts">
    <div>
      {#if onDelete}
        <button type="button" class="aa-lenses-act aa-lenses-act--danger" onclick={onDelete} disabled={saving}>
          Delete lens
        </button>
      {/if}
    </div>
    <div class="aa-lenses-edit__save-actions">
      <button type="button" class="aa-lenses-act" onclick={onCancel} disabled={saving}>
        Cancel
      </button>
      <button
        type="submit"
        class="aa-lenses-act aa-lenses-act--primary aa-lenses-act--save"
        disabled={saving || !name.trim()}
      >
        {saving ? submittingLabel : submitLabel}
      </button>
    </div>
  </footer>
</form>
