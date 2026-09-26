<script lang="ts">
  // Project page host (`/projects/:permalink`) — S5 now owns the STANDARD
  // branch (ProjectDetailView: Why, progress, Next-step hero, horizon groups,
  // lifecycle). SIMPLE_LIST projects still host S4's SimpleListChecklist,
  // resolved through the shared tasks read (listProject).
  import { page } from "$app/stores";
  import { client } from "../../../lib/api";
  import SimpleListChecklist from "../../../lib/components/SimpleListChecklist.svelte";
  import ProjectDetailView from "../../../lib/components/projects/ProjectDetailView.svelte";
  import type { ListProjectDto } from "../../../lib/dto";
  import { pageTitle } from "../../../lib/stores/pageTitle.svelte";

  const permalink = $derived($page.params.permalink ?? "");

  let project = $state<ListProjectDto | null>(null);
  let loading = $state(true);

  $effect(() => {
    loading = true;
    void client.tasks
      .listProject({ permalink })
      .then((row) => (project = row))
      .catch(() => (project = null))
      .finally(() => (loading = false));
  });

  // The host fetch lives in local state — publish the name for the tab title
  // (the STANDARD branch's store-backed detail takes precedence in the layout,
  // so this override only matters while it's the honest source).
  $effect(() => {
    if (project) pageTitle.set("/projects/[permalink]", permalink, project.name);
    return () => pageTitle.clearIf("/projects/[permalink]", permalink);
  });
</script>

{#if loading}
  <div class="aa-detail aa-project" aria-label="Loading project">
    <div class="aa-skeleton aa-skeleton--heading"></div>
    <div class="aa-skeleton aa-skeleton--row"></div>
    <div class="aa-skeleton aa-skeleton--row"></div>
    <div class="aa-skeleton aa-skeleton--row"></div>
  </div>
{:else if !project}
  <div class="aa-detail aa-project">
    <p class="aa-state">This project doesn't exist — or isn't yours.</p>
  </div>
{:else if project.type === "SIMPLE_LIST"}
  <div class="aa-detail aa-project">
    <nav class="aa-crumbs" aria-label="Breadcrumb">
      <a href="/projects">Projects</a>
      <span class="aa-crumbs__sep" aria-hidden="true">›</span>
      <span class="aa-crumbs__current">{project.name}</span>
    </nav>
    <SimpleListChecklist projectId={project.id} />
  </div>
{:else}
  <!-- STANDARD — the full S5 work surface (loads its own detail by permalink). -->
  <ProjectDetailView />
{/if}

<style>
  /* Same skeleton language as the Someday/Today/Week loading states. */
  .aa-skeleton {
    border-radius: var(--aa-radius-md);
    background: var(--aa-surface-muted, oklch(0.96 0.005 240));
  }
  .aa-skeleton--heading {
    height: 0.7rem;
    width: 8rem;
  }
  .aa-skeleton--row {
    height: 2.2rem;
    margin-top: 0.5rem;
  }
</style>
