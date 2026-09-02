<script lang="ts">
  // Settings → Lenses tab. Ported from webapp/src/lenses/LensesPage.tsx.
  // Pro-only: lists every lens with inline edit (rename / purpose / color),
  // create-at-cap, and delete (non-default only) with the two-mode dialog.
  // FREE users see the shared ProGate — they configure nothing. Sort order
  // mirrors getLenses: included-first (Me), then seeded (Work), then createdAt.
  //
  // No keyboard shortcuts on this surface (s11 notes §4); every destructive
  // action runs through the confirm dialog; the server is the boundary (the
  // client ProGate + gate-on-402 is the friendly layer).
  import { onMount } from "svelte";
  import LensForm from "../../../../lib/components/settings/LensForm.svelte";
  import DeleteLensDialog from "../../../../lib/components/settings/DeleteLensDialog.svelte";
  import {
    lenses,
    LENS_PRO_LIMIT,
    CUSTOM_LENSES_GATE,
    type LensSummary,
  } from "../../../../lib/stores/lenses.svelte";
  import { prefs } from "../../../../lib/stores/prefs.svelte";

  let creating = $state(false);
  let editingId = $state<string | null>(null);
  let deletingLens = $state<LensSummary | null>(null);
  let loadError = $state<string | null>(null);

  onMount(() => {
    void (async () => {
      // Entitlement first (the whole tab is gated), then the list.
      if (!prefs.account) await prefs.loadAccount();
      if (!lenses.entitled(prefs.account)) return;
      await lenses.loadRows();
      loadError = lenses.error;
    })();
  });

  const entitled = $derived(lenses.entitled(prefs.account));
  const rows = $derived(lenses.rows);
  const atCap = $derived(rows.length >= LENS_PRO_LIMIT);

  async function refresh() {
    // getLenses feeds this page; the app mirror feeds the switcher + counts
    // (webapp invalidated getLenses + getAppData).
    await lenses.refresh();
    loadError = lenses.error;
  }
</script>

{#if !entitled}
  <!-- FREE: the whole tab is Pro-gated. Calm copy, no list, no edits. -->
  <div class="aa-pro-gate aa-lenses-gate" role="alert">
    <p class="aa-pro-gate__title">{CUSTOM_LENSES_GATE.feature} is a Pro feature.</p>
    <p class="aa-pro-gate__reason">{CUSTOM_LENSES_GATE.reason}</p>
  </div>
{:else}
  <section class="aa-settings-section">
    <p class="aa-settings-note">
      A lens is one life context — one identity and one focused surface. The two defaults can be
      renamed and recolored but not deleted. Add more on Pro (soft cap {LENS_PRO_LIMIT}).
    </p>
  </section>

  <section class="aa-settings-section">
    <h2 class="aa-settings-sh">Your lenses</h2>

    {#if lenses.loading && !lenses.loaded}
      <p class="aa-lenses-empty">Loading…</p>
    {:else if loadError}
      <p class="aa-settings-error">{loadError}</p>
    {:else if rows.length === 0}
      <p class="aa-lenses-empty">No lenses yet.</p>
    {:else}
      <div class="aa-lenses-list">
        {#each rows as lens (lens.id)}
          {#if editingId === lens.id}
            <LensForm
              initial={{
                name: lens.name,
                purpose: lens.purpose ?? "",
                color: lens.color ?? "indigo",
              }}
              submit={async (vals) => {
                await lenses.update({ id: lens.id, ...vals });
              }}
              submitLabel="Save changes"
              submittingLabel="Saving…"
              errorPreamble="Couldn't save. Try again."
              onCancel={() => (editingId = null)}
              onDelete={!lens.isDefault ? () => (deletingLens = lens) : undefined}
              onDone={async () => {
                editingId = null;
                await refresh();
              }}
            />
            {#if deletingLens?.id === lens.id}
              <DeleteLensDialog
                lens={lens}
                allLenses={rows}
                onClose={() => (deletingLens = null)}
                onDeleted={async () => {
                  deletingLens = null;
                  editingId = null;
                  await refresh();
                }}
              />
            {/if}
          {:else}
            <div class="aa-lenses-row" data-lens-color={lens.color || undefined}>
              <span class="aa-lenses-row__dot" aria-hidden="true"></span>
              <div class="aa-lenses-row__main">
                <div class="aa-lenses-row__name">{lens.name}</div>
                {#if lens.purpose}
                  <div class="aa-lenses-row__purpose">{lens.purpose}</div>
                {/if}
                <div class="aa-lenses-row__meta">
                  <span>{lens.counts.goals} goals</span>
                  <span>{lens.counts.projects} projects</span>
                  <span>{lens.counts.tasks} tasks</span>
                </div>
              </div>
              <div class="aa-lenses-row__acts">
                <button
                  type="button"
                  class="aa-lenses-act"
                  onclick={() => (editingId = lens.id)}
                >
                  Edit
                </button>
              </div>
            </div>
            {#if deletingLens?.id === lens.id}
              <DeleteLensDialog
                lens={lens}
                allLenses={rows}
                onClose={() => (deletingLens = null)}
                onDeleted={async () => {
                  deletingLens = null;
                  await refresh();
                }}
              />
            {/if}
          {/if}
        {/each}
      </div>
    {/if}

    {#if creating}
      <LensForm
        initial={{ name: "", purpose: "", color: "coral" }}
        submit={async (vals) => {
          await lenses.create(vals);
        }}
        submitLabel="Create lens"
        submittingLabel="Creating…"
        errorPreamble="Couldn't create. Try again."
        namePlaceholder="e.g. Studio, Board, Side project"
        autoFocusName
        onCancel={() => (creating = false)}
        onDone={async () => {
          creating = false;
          await refresh();
        }}
      />
    {:else}
      <button
        type="button"
        class="aa-lenses-add"
        onclick={() => (creating = true)}
        disabled={atCap}
        title={atCap ? `Soft cap of ${LENS_PRO_LIMIT} lenses reached` : undefined}
      >
        + New lens
      </button>
    {/if}
    {#if atCap && !creating}
      <p class="aa-lenses-cap-note">
        You've reached the soft cap of {LENS_PRO_LIMIT} lenses. Delete one to add another.
      </p>
    {/if}
  </section>
{/if}
