<script lang="ts">
  /**
   * Inbox — the capture destination (S3). Untriaged items, newest first,
   * with parsed-token chips. Ported from webapp/src/inbox/InboxPage.tsx.
   * `?item=<id>` deep-links: the row scrolls into view + highlights.
   * Capture opens through the global ⌘K overlay mounted by +layout.svelte
   * (`?capture=1` and the empty-state CTA open the same one).
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import Chip from "../../../lib/components/Chip.svelte";
  import Icon from "../../../lib/components/Icon.svelte";
  import Linkify from "../../../lib/components/Linkify.svelte";
  import CaptureFab from "../../../lib/components/CaptureFab.svelte";
  import { capture } from "../../../lib/stores/capture.svelte";
  import { inbox, type InboxItem } from "../../../lib/stores/inbox.svelte";
  import { formatAgo, formatRelativeDay, formatSnoozedUntil } from "../../../lib/format/dates";

  import "../../../lib/styles/Chip.css";
  import "../../../lib/styles/Linkify.css";
  import "../../../lib/styles/InboxPage.css";

  onMount(() => {
    void inbox.load();
  });

  const list = $derived(inbox.items);
  const targetItemId = $derived(new URL(page.url.href).searchParams.get("item") ?? null);
  const countLabel = $derived(
    `${list.length} ${list.length === 1 ? "captured thought" : "captured thoughts"}`,
  );

  // One-shot URL open (`/do?capture=1` and the empty-state CTA): opens
  // capture, then clears the param so a refresh doesn't reopen it.
  $effect(() => {
    if (new URL(page.url.href).searchParams.get("capture") === "1") {
      void capture.show();
      const url = new URL(page.url.href);
      url.searchParams.delete("capture");
      history.replaceState(history.state, "", url.href);
    }
  });

  $effect(() => {
    if (
      !targetItemId ||
      !list.some((item: InboxItem) => item.id === targetItemId)
    )
      return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`inbox-item-${targetItemId}`)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  /** The row's display title — a structured share's title, else the raw capture. */
  function previewTitle(item: InboxItem): string {
    return item.title?.trim() || item.text;
  }

  function normalizedPreview(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  /** The share's origin chip — hostname minus www., fallback label. */
  function sourceHost(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "") || "Link attached";
    } catch {
      return "Link attached";
    }
  }
</script>

<div class="aa-inbox">
  <header class="aa-inbox__header">
    <p class="aa-inbox__eyebrow">Universal inbox</p>
    <h1 class="aa-inbox__title">Inbox</h1>
    <p class="aa-inbox__sub">
      Everything you capture waits here until you decide where it belongs.
    </p>
  </header>

  <section class="aa-inbox__surface" aria-label="Captured thoughts">
    {#if !inbox.loaded && inbox.busy}
      <div class="aa-inbox__loading" aria-label="Loading inbox">
        <span class="aa-inbox__loading-line aa-inbox__loading-line--short"></span>
        <span class="aa-inbox__loading-line"></span>
        <span class="aa-inbox__loading-line aa-inbox__loading-line--mid"></span>
      </div>
    {:else if inbox.error}
      <p class="aa-inbox__empty-text" role="alert">{inbox.error}</p>
    {:else if list.length === 0}
      <div class="aa-inbox__empty">
        <div class="aa-inbox__empty-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M5 7.5h14v10H5z" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M5 14h4l1.5 2h3l1.5-2h4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path d="M8 4.5h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </div>
        <h2 class="aa-inbox__empty-title">Inbox clear</h2>
        <p class="aa-inbox__empty-text">
          Nothing is waiting for a decision. Capture a thought whenever it
          crosses your mind.
        </p>
        <p class="aa-inbox__empty-hint">
          Capture anytime <span class="aa-inbox__kbd">⌘K</span>
        </p>
        <a href="/do/inbox?capture=1" class="aa-inbox__cta aa-inbox__empty-cta">
          <span>Capture a thought</span>
          <Icon name="arrow-right" />
        </a>
      </div>
    {:else}
      <div class="aa-inbox__queue-header">
        <div>
          <p class="aa-inbox__queue-title">Waiting for a decision</p>
          <p class="aa-inbox__queue-count">{countLabel} · newest first</p>
        </div>
        <a href="/do/inbox/review" class="aa-inbox__cta">
          <span>Start triage</span>
          <Icon name="arrow-right" />
        </a>
      </div>
      <ul class="aa-inbox__list">
        {#each list as item, i (item.id)}
          <li
            id="inbox-item-{item.id}"
            class="aa-inbox__item{item.id === targetItemId ? " is-search-target" : ""}"
          >
            <div class="aa-inbox__row">
              <div class="aa-inbox__row-main">
                <div class="aa-inbox__row-content">
                  <p class="aa-inbox__row-text">
                    <Linkify text={previewTitle(item)} />
                  </p>
                  {#if item.content?.trim() && normalizedPreview(item.content) !== normalizedPreview(previewTitle(item))}
                    <p class="aa-inbox__row-content-text">
                      <Linkify text={item.content.trim()} />
                    </p>
                  {/if}
                  <div class="aa-inbox__row-meta">
                    <span class="aa-inbox__row-ago">
                      captured {formatAgo(item.createdAt)}
                    </span>
                    {#if item.sourceUrl}
                      <Chip variant="teal" small>↗ {sourceHost(item.sourceUrl)}</Chip>
                    {/if}
                    {#if item.parsedScheduledDate}
                      <Chip variant="teal" small>
                        <Icon name="calendar" size={10} />
                        {formatRelativeDay(item.parsedScheduledDate)}
                      </Chip>
                    {/if}
                    {#if item.parsedSnoozedUntil}
                      <Chip variant="teal" small>
                        <Icon name="calendar" size={10} />
                        snoozed until {formatSnoozedUntil(item.parsedSnoozedUntil)}
                      </Chip>
                    {/if}
                    {#if item.parsedProject}
                      <Chip variant="teal" small>
                        <Icon name="box" size={10} />
                        {item.parsedProject}
                      </Chip>
                    {/if}
                    {#if item.parsedPriority === "IMPORTANT"}
                      <Chip variant="amber" small>
                        <Icon name="star" size={10} />
                        Important
                      </Chip>
                    {/if}
                    {#if item.parsedPriority === "LOW"}
                      <Chip variant="muted" small>low</Chip>
                    {/if}
                    {#if item.parsedSize}
                      <Chip variant="default" small>{item.parsedSize}</Chip>
                    {/if}
                    {#each item.parsedTags as t (t)}
                      <Chip variant={t.startsWith("@") ? "amber" : "violet"} small>
                        <Icon name="hash" size={10} />
                        {t}
                      </Chip>
                    {/each}
                  </div>
                </div>
                <Icon name="arrow-right" size={14} />
              </div>
              <!-- The stretched-link overlay: the whole row navigates to
                  triage while staying one clickable sibling (never nested
                  anchors). -->
              <a
                href="/do/inbox/review?i={i}"
                class="aa-inbox__row-link"
                aria-label="Triage “{previewTitle(item)}”"
              ></a>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<CaptureFab />
