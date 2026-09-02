<script lang="ts">
  // Project page host (`/do/projects/:permalink`) — S5 now owns the STANDARD
  // branch (ProjectDetailView: Why, progress, Next-step hero, horizon groups,
  // lifecycle). SIMPLE_LIST projects still host S4's SimpleListChecklist,
  // resolved through the shared tasks read (listProject).
  import { page } from "$app/stores";
  import { client } from "../../../../lib/api";
  import SimpleListChecklist from "../../../../lib/components/SimpleListChecklist.svelte";
  import ProjectDetailView from "../../../../lib/components/projects/ProjectDetailView.svelte";
  import type { ListProjectDto } from "../../../../lib/dto";

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
</script>

{#if loading}
  <div class="aa-detail aa-project">
    <p class="aa-state">Loading…</p>
  </div>
{:else if !project}
  <div class="aa-detail aa-project">
    <p class="aa-state">This project doesn't exist — or isn't yours.</p>
  </div>
{:else if project.type === "SIMPLE_LIST"}
  <div class="aa-detail aa-project">
    <nav class="aa-crumbs" aria-label="Breadcrumb">
      <a href="/do/projects">Projects</a>
      <span class="aa-crumbs__sep" aria-hidden="true">›</span>
      <span class="aa-crumbs__current">{project.name}</span>
    </nav>
    <SimpleListChecklist projectId={project.id} />
  </div>
{:else}
  <!-- STANDARD — the full S5 work surface (loads its own detail by permalink). -->
  <ProjectDetailView />
{/if}
