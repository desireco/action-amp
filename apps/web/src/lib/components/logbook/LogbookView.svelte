<script lang="ts">
  /**
   * LogbookView — the /do/logbook surface (webapp LogbookPage parity): the
   * record of things no longer active, grouped by day. Five kinds share the
   * timeline — completed tasks (with markdown outcome), wont-do tasks,
   * completed projects (with their goal chip), completed goals, archived
   * notes. Actions: Restore (archived → inbox; wont-do → Upcoming), Reopen
   * (goal/project → active list). `?item=<id>` deep-link (sitewide search)
   * scrolls the row into view and highlights it. No page keyset — reached via
   * global nav / palette (S9); Restore/Reopen are pointer-only.
   */
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import GroupedList from "../GroupedList.svelte";
  import ListEmpty from "../ListEmpty.svelte";
  import Chip from "../Chip.svelte";
  import BrandMark from "./BrandMark.svelte";
  import Markdown from "./Markdown.svelte";
  import { logbook, groupLogbook, type LogItem } from "../../stores/logbook.svelte";
  import "../../styles/logbook.css";

  const groups = $derived(logbook.data ? groupLogbook(logbook.data) : []);
  const targetItemId = $derived($page.url.searchParams.get("item") ?? "");

  onMount(() => {
    void logbook.load();
  });

  // ?item= anchor — fires only when the id is present in the loaded groups.
  $effect(() => {
    if (
      !targetItemId ||
      !groups.some((group) => group.items.some((item) => item.id === targetItemId))
    ) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`logbook-item-${targetItemId}`)
        ?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "center",
        });
    });
    return () => cancelAnimationFrame(frame);
  });

  const showEmpty = $derived(logbook.loaded && groups.length === 0);
</script>

<div class="aa-logbook">
  <header class="aa-list-header">
    <div>
      <div class="aa-list-header__eyebrow">Review</div>
      <h1 class="aa-list-header__title">Logbook</h1>
      <p class="aa-list-header__description">
        Done and archived work, grouped by day.
      </p>
    </div>
  </header>

  {#if logbook.error}
    <p class="aa-logbook__error" role="alert">{logbook.error}</p>
  {/if}

  {#if showEmpty}
    <ListEmpty
      title="Nothing here yet."
      text="Completed work and archived notes land here — a calm record, not a guilt trip. Check off a task or archive a note and it'll show up."
    >
      {#snippet icon()}
        <span class="aa-logbook-empty-mark">
          <BrandMark size="md" />
        </span>
      {/snippet}
    </ListEmpty>
  {:else if groups.length > 0}
    <GroupedList {groups}>
      {#snippet renderItem(item)}
        {@const entry = item as LogItem}
        <div
          id="logbook-item-{entry.id}"
          class="aa-logbook-row{entry.id === targetItemId ? ' is-search-target' : ''}"
        >
          <span class="aa-logbook-row__check" aria-hidden="true">
            {#if entry.kind === "archived"}
              <!-- A muted box icon for archived notes — distinct from the BrandMark check. -->
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="3"
                  width="12"
                  height="3"
                  rx="1"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <path
                  d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linejoin="round"
                />
                <path
                  d="M6.5 9h3"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
            {:else}
              <BrandMark size="sm" />
            {/if}
          </span>
          <div class="aa-logbook-row__main">
            <span class="aa-logbook-row__title">{entry.title}</span>
            {#if entry.kind === "task" && entry.outcome}
              <div class="aa-logbook-row__outcome">
                <Markdown text={entry.outcome} />
              </div>
            {/if}
            <div class="aa-logbook-row__meta">
              {#if entry.kind === "goal"}
                <Chip variant="teal" small>Goal</Chip>
              {:else if entry.kind === "project"}
                <Chip variant="violet" small>Project</Chip>
              {:else if entry.kind === "archived"}
                <Chip variant="muted" small>Archived</Chip>
              {:else if entry.kind === "wont-do"}
                <Chip variant="muted" small>Won't do</Chip>
              {:else if entry.project}
                <Chip variant="violet" small>{entry.project.name}</Chip>
              {/if}
              {#if entry.kind === "wont-do" && entry.project}
                <Chip variant="violet" small>{entry.project.name}</Chip>
              {/if}
              {#if entry.goal}
                <Chip variant="teal" small>{entry.goal.name}</Chip>
              {/if}
            </div>
          </div>
          {#if entry.kind === "archived"}
            <button
              type="button"
              class="aa-logbook-row__restore"
              onclick={() => void logbook.restoreArchived(entry.id)}
              title="Send back to the inbox"
            >
              Restore
            </button>
          {:else if entry.kind === "wont-do"}
            <button
              type="button"
              class="aa-logbook-row__restore"
              onclick={() => void logbook.restoreWontDo(entry.id)}
              title="Reactivate — returns to Upcoming"
            >
              Restore
            </button>
          {:else if entry.kind === "goal"}
            <button
              type="button"
              class="aa-logbook-row__restore"
              onclick={() => void logbook.reopenGoal(entry.id)}
              title="Return to active goals"
            >
              Reopen
            </button>
          {:else if entry.kind === "project"}
            <button
              type="button"
              class="aa-logbook-row__restore"
              onclick={() => void logbook.reopenProject(entry.id)}
              title="Return to active projects"
            >
              Reopen
            </button>
          {/if}
        </div>
      {/snippet}
    </GroupedList>
  {/if}
</div>

<style>
  .aa-logbook__error {
    color: var(--aa-rose-text, oklch(0.55 0.18 25));
    font-size: var(--aa-text-sm);
    text-align: center;
    padding: var(--aa-space-md) 0;
  }
</style>
