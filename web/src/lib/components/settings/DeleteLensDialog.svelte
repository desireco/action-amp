<script lang="ts">
  // DeleteLensDialog — the two-mode delete confirm (webapp LensesPage.tsx
  // DeleteLensDialog). With content: radio defaults to "Move to another
  // lens" (no silent cascade). Empty lens: "Deleting it removes only the lens
  // itself." Confirm label carries the lens name; blocking errors render
  // inline; the server's 409 strings surface verbatim.
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import { lenses, operationErrorMessage, type LensSummary } from "../../stores/lenses.svelte";

  let {
    lens,
    allLenses,
    onClose,
    onDeleted,
  }: {
    lens: LensSummary;
    /** Fallback when the live list hasn't refreshed (webapp prop parity). */
    allLenses: LensSummary[];
    onClose: () => void;
    onDeleted: () => Promise<void>;
  } = $props();

  // Live rows for the reassign picker (the webapp re-queried getLenses here to
  // be safe against a stale parent list; the store's rows serve that).
  const targets = $derived((lenses.rows.length > 0 ? lenses.rows : allLenses).filter(
    (candidate) => candidate.id !== lens.id,
  ));
  const hasContent = $derived(lens.hasAnyContent);
  const contentSummary = $derived(
    lens.counts.goals + lens.counts.projects + lens.counts.tasks > 0
      ? `${lens.counts.goals} goals, ${lens.counts.projects} projects, ${lens.counts.tasks} tasks`
      : "completed work or history",
  );

  let mode = $state<"reassign" | "delete">(hasContent ? "reassign" : "delete");
  let targetId = $state(targets[0]?.id ?? "");
  let deleting = $state(false);
  let error = $state<string | null>(null);

  const cannotReassign = $derived(mode === "reassign" && !targetId);

  // Keep a valid target selected when the list changes.
  $effect(() => {
    if (!targetId && targets.length > 0) targetId = targets[0].id;
  });

  async function confirm() {
    if (cannotReassign) {
      error = "Choose a lens to move content into.";
      return;
    }
    deleting = true;
    error = null;
    try {
      await lenses.remove(lens.id, mode, mode === "reassign" ? targetId : undefined);
      await onDeleted();
    } catch (e) {
      error = operationErrorMessage(e, "Couldn't delete. Try again.");
    } finally {
      deleting = false;
    }
  }
</script>

<ConfirmDialog
  title={`Delete the "${lens.name}" lens`}
  confirmLabel={deleting ? "Deleting…" : `Delete ${lens.name}`}
  cancelLabel="Cancel"
  danger
  confirmDisabled={deleting || cannotReassign}
  onConfirm={confirm}
  {onClose}
>
  {#snippet message()}
    <div class="aa-lenses-delete">
      {#if hasContent}
        <p>
          This lens has <strong>{contentSummary}</strong>. Choose what happens to them:
        </p>
        <label class="aa-lenses-delete__opt">
          <input
            type="radio"
            name="delete-mode"
            checked={mode === "reassign"}
            onchange={() => (mode = "reassign")}
            disabled={deleting}
          />
          <span>
            <strong>Move to another lens</strong>
            <select
              class="aa-lenses-delete__select"
              bind:value={targetId}
              disabled={deleting || mode !== "reassign" || targets.length === 0}
            >
              {#each targets as t (t.id)}
                <option value={t.id}>{t.name}</option>
              {/each}
            </select>
          </span>
        </label>
        {#if targets.length === 0}
          <p>Create another lens first, or empty this lens before deleting it.</p>
        {/if}
      {:else}
        <p>This lens is empty. Deleting it removes only the lens itself.</p>
      {/if}
      {#if error}<p class="aa-lenses-error">{error}</p>{/if}
    </div>
  {/snippet}
</ConfirmDialog>
