<script lang="ts">
  /**
   * ResourceSection — the project page's Resources section (S9 port of
   * webapp/src/projects/ProjectDetailPage.tsx's resources block; parity
   * checklist in packages/contract/src/s9-search-resources/README.md §3).
   *
   * A Resource is project-owned reference material — a link + notes, "NOT an
   * action". Rows: external link (↗ title) or plain title, notes, per-row
   * Edit / Remove ghost buttons; the Add/Edit sheet is the shared BottomSheet
   * (Title / Link / Notes, server errors inline); Remove confirms through the
   * shared ConfirmDialog with the exact webapp copy. The `#resource-<id>`
   * hash anchor scrolls + highlights the search-target row.
   *
   * Attachment thumbs are S12 (share target) — the contract carries none yet.
   */
  import { page } from "$app/stores";
  import { client } from "../../api";
  import BottomSheet from "../BottomSheet.svelte";
  import ConfirmDialog from "../ConfirmDialog.svelte";
  import { projects, messageFromError, type ProjectResourceRef } from "../../stores/projects.svelte";
  import "../../styles/resources.css";

  let { project }: { project: { id: string; permalink: string; resources: ProjectResourceRef[] } } =
    $props();

  type Editing = ProjectResourceRef | "new";

  let editor = $state<Editing | null>(null);
  let title = $state("");
  let url = $state("");
  let notes = $state("");
  let saveError = $state<string | null>(null);
  let saving = $state(false);
  let toDelete = $state<ProjectResourceRef | null>(null);

  // The search anchor: /do/projects/<permalink>#resource-<id> — highlighted
  // only once the row exists (the search lands after a fresh create).
  const targetResourceId = $derived(
    $page.url.hash.startsWith("#resource-") ? decodeURIComponent($page.url.hash.slice("#resource-".length)) : null,
  );

  $effect(() => {
    if (!targetResourceId) return;
    if (!project.resources.some((resource) => resource.id === targetResourceId)) return;
    document.getElementById(`resource-${targetResourceId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });

  function openEditor(resource: Editing) {
    editor = resource;
    title = resource === "new" ? "" : resource.title;
    url = resource === "new" ? "" : (resource.url ?? "");
    notes = resource === "new" ? "" : (resource.notes ?? "");
    saveError = null;
  }

  async function save() {
    if (!editor || saving) return;
    saving = true;
    saveError = null;
    try {
      if (editor === "new") {
        await client.resources.create({
          projectId: project.id,
          title,
          url,
          notes,
        });
      } else {
        await client.resources.update({ id: editor.id, title, url, notes });
      }
      editor = null;
      await projects.loadDetail(project.permalink);
    } catch (e) {
      saveError = messageFromError(e);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!toDelete) return;
    try {
      await client.resources.delete({ id: toDelete.id });
      toDelete = null;
      await projects.loadDetail(project.permalink);
    } catch (e) {
      toDelete = null;
      saveError = messageFromError(e);
    }
  }
</script>

<section class="aa-project__resources" aria-labelledby="project-resources-heading">
  <div class="aa-project__resources-head">
    <h2 id="project-resources-heading" class="aa-project__resources-title">Resources</h2>
    <button type="button" class="aa-btn aa-btn--primary aa-btn--sm" onclick={() => openEditor("new")}>
      Add resource
    </button>
    <p class="aa-project__resources-copy">
      Links, notes, and reference material for this project.
    </p>
  </div>

  {#if project.resources.length === 0}
    <p class="aa-project__resources-empty">Nothing saved here yet.</p>
  {:else}
    <ul class="aa-project__resources-list">
      {#each project.resources as resource (resource.id)}
        <li
          id={`resource-${resource.id}`}
          class="aa-project__resource"
          class:is-search-target={resource.id === targetResourceId}
        >
          <div class="aa-project__resource-main">
            {#if resource.url}
              <a
                class="aa-project__resource-link"
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span aria-hidden="true">↗</span>
                {resource.title}
              </a>
            {:else}
              <span class="aa-project__resource-title">{resource.title}</span>
            {/if}
            {#if resource.notes}
              <p class="aa-project__resource-notes">{resource.notes}</p>
            {/if}
          </div>
          <div class="aa-project__resource-actions">
            <button type="button" class="aa-btn aa-btn--bare aa-btn--sm" onclick={() => openEditor(resource)}>
              Edit
            </button>
            <button type="button" class="aa-btn aa-btn--bare aa-btn--sm" onclick={() => (toDelete = resource)}>
              Remove
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if editor}
  <BottomSheet
    title={editor === "new" ? "Add resource" : "Edit resource"}
    onClose={() => (editor = null)}
  >
    <form
      class="aa-project__resource-form"
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label>
        Title
        <!-- svelte-ignore a11y_autofocus -->
        <input autofocus bind:value={title} placeholder="What is this?" />
      </label>      <label>
        Link <span>(optional)</span>
        <input bind:value={url} placeholder="https://…" type="url" />
      </label>
      <label>
        Notes <span>(optional)</span>
        <textarea bind:value={notes} placeholder="Why keep this?" rows="4"></textarea>
      </label>
      {#if saveError}
        <p class="aa-project__resource-error" role="alert">{saveError}</p>
      {/if}
      <div class="aa-project__resource-form-actions">
        <button type="button" class="aa-btn aa-btn--secondary aa-btn--sm" onclick={() => (editor = null)}>
          Cancel
        </button>
        <button type="submit" class="aa-btn aa-btn--primary aa-btn--sm" disabled={saving}>
          {saving ? "Saving…" : "Save resource"}
        </button>
      </div>
    </form>
  </BottomSheet>
{/if}

{#if toDelete}
  <ConfirmDialog
    title="Remove this resource?"
    message={`“${toDelete.title}” will be removed from this project. Tasks and their Context links stay unchanged.`}
    confirmLabel="Remove resource"
    danger
    onConfirm={remove}
    onClose={() => (toDelete = null)}
  />
{/if}
