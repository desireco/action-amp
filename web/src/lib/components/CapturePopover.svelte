<script lang="ts">
  /**
   * CapturePopover — the universal quick-capture input (⌘K). Ported from
   * webapp/src/components/ui/CapturePopover.tsx (S2; styles ship from
   * ui/Overlays.css). Image intake rides the S12 attachment contract
   * (createInboxItem.attachments): pick via the attach button (mobile:
   * camera/gallery sheet), paste into the textarea (⌘V), or drop on the
   * card — up to 4 images, ≤5 MB each, removable before submit.
   *
   *   Enter       → capture + close
   *   ⌘Enter      → capture + clear + keep open (rapid-fire, max 3 confirmations)
   *   Shift+Enter → literal newline
   *   #           → project autocomplete (↑/↓ navigate, Enter/Tab accept, Esc close)
   *   Live chips  → the SAME NL parser the server persists with (client copy)
   */
  import { tick } from "svelte";
  // The overlay styles ship with the component (webapp's ui/Overlays.css
  // classes): the popover mounts from +layout.svelte on every page, so it
  // cannot rely on a per-page import.
  import "../components/ui/Overlays.css";
  import Chip from "./ui/Chip.svelte";
  import { capture } from "../stores/capture.svelte";
  import { inbox } from "../stores/inbox.svelte";
  import { parseCapture, type ParsedCapture } from "../capture/parse";
  import { detectMention, type MentionState } from "../capture/detectMention";
  import { getCaretCoordinates } from "../capture/caretCoords";
  import {
    fileToDataUrl,
    fileToImageAttachmentInput,
    imageFilesFromDataTransfer,
    rawFilesFromDataTransfer,
    MAX_CAPTURE_IMAGES,
    MAX_IMAGE_BYTES,
  } from "../capture/files";
  import { formatRelativeDay, formatSnoozedUntil } from "../format/dates";

  const MAX_HEIGHT_PX = 96;
  const MENTION_LIMIT = 8;

  interface CapturedItem {
    id: number;
    text: string;
    parsed: ParsedCapture;
  }

  /** A not-yet-saved image: the File plus its data: URL preview (CSP-safe). */
  interface PendingImage {
    file: File;
    url: string;
  }

  interface Mention {
    name: string;
    kind: "project";
    lensName?: string | null;
  }

  let text = $state("");
  let submitting = $state(false);
  let captured = $state<CapturedItem[]>([]);
  let error = $state<string | null>(null);
  let caretIndex = $state(0);
  let mentionSel = $state(0);
  let mentionPos = $state<{ top: number; left: number } | null>(null);
  let taEl: HTMLTextAreaElement | null = $state(null);
  let cardEl: HTMLDivElement | null = $state(null);
  let fileEl: HTMLInputElement | null = $state(null);
  let cameraEl: HTMLInputElement | null = $state(null);
  let attachEl: HTMLButtonElement | null = $state(null);
  let menuFirstEl: HTMLButtonElement | null = $state(null);
  let images = $state<PendingImage[]>([]);
  let attachMenu = $state(false);
  let dragging = $state(false);
  // dragenter/dragleave fire per child element — count depth so the
  // highlight stays stable while the drag moves across the card.
  let dragDepth = 0;

  const knownLensNames = $derived(capture.lenses.map((l) => l.name));
  const activeLensName = $derived(capture.lenses.find((l) => l.isIncluded)?.name ?? capture.lenses[0]?.name ?? null);

  const parsed = $derived(
    text.trim() ? parseCapture(text, new Date(), knownLensNames) : null,
  );

  // Detect an open `#`-mention at the caret.
  const mention: MentionState | null = $derived(detectMention(text, caretIndex));

  // The autocomplete source: STANDARD projects only (lists are not capture
  // targets), deduped by lowercased name, startsWith(query), max 8.
  const mentionMatches: Mention[] = $derived.by(() => {
    if (!mention) return [];
    const q = mention.query;
    const seen = new Set<string>();
    const picks: Mention[] = [];
    for (const p of capture.projects) {
      if (p.type === "SIMPLE_LIST") continue;
      const key = p.name.toLowerCase();
      if (seen.has(key) || !key.startsWith(q)) continue;
      seen.add(key);
      picks.push({ name: p.name, kind: "project", lensName: p.lensName });
    }
    return picks.slice(0, MENTION_LIMIT);
  });

  // Keep the selection in range as the filtered list changes (resets to the
  // first row whenever the query shrinks the matches).
  $effect(() => {
    const len = mentionMatches.length;
    mentionSel = Math.min(mentionSel, Math.max(0, len - 1));
  });

  // Position the dropdown at the caret (card-relative).
  $effect(() => {
    if (!mention || mentionMatches.length === 0) {
      mentionPos = null;
      return;
    }
    const ta = taEl;
    const card = cardEl;
    if (!ta || !card) {
      mentionPos = { top: 56, left: 16 };
      return;
    }
    try {
      const { top, left, lineHeight } = getCaretCoordinates(ta, mention.end);
      const taRect = ta.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      mentionPos = {
        top: taRect.top - cardRect.top + top + lineHeight,
        left: Math.max(taRect.left - cardRect.left + left, 0),
      };
    } catch {
      mentionPos = { top: 56, left: 16 };
    }
  });

  $effect(() => {
    if (capture.open) {
      void tick().then(() => {
        taEl?.focus();
        grow();
      });
    }
  });

  function grow(): void {
    const el = taEl;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }

  function resetInput(): void {
    text = "";
    images = [];
    caretIndex = 0;
    mentionSel = 0;
    mentionPos = null;
    if (taEl) taEl.style.height = "auto";
    void tick().then(() => taEl?.focus());
  }

  /**
   * Validate + queue images. Client-side mirror of prepareImageAttachments
   * (same caps, same error copy) so bad files are rejected before submit;
   * the server still re-validates. A file already in the pending list is a
   * silent no-op — re-adding identical bytes is never the intent. Previews
   * are data: URLs, so there is nothing to revoke on remove/clear.
   */
  async function addFiles(incoming: File[]): Promise<void> {
    error = null;
    const imageFiles = incoming.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      if (incoming.length > 0) error = "Only images can be attached.";
      return;
    }
    const fresh = imageFiles.filter((f) => !images.some((p) => p.file === f));
    if (fresh.length === 0) return;
    const fitting = fresh.filter((f) => f.size <= MAX_IMAGE_BYTES);
    let nextError: string | null =
      fitting.length < fresh.length ? "Each image must be 5 MB or smaller." : null;
    const room = MAX_CAPTURE_IMAGES - images.length;
    const accepted = fitting.slice(0, Math.max(0, room));
    if (accepted.length < fitting.length) {
      nextError = `Attach up to ${MAX_CAPTURE_IMAGES} images at a time.`;
    }
    if (accepted.length > 0) {
      const previews = await Promise.all(
        accepted.map(async (file) => ({ file, url: await fileToDataUrl(file) })),
      );
      // Re-dedupe + cap against post-await state (the reads leave a window
      // where a second addFiles could have landed).
      images = [
        ...images,
        ...previews
          .filter((p) => !images.some((q) => q.file === p.file))
          .slice(0, Math.max(0, MAX_CAPTURE_IMAGES - images.length)),
      ];
    }
    error = nextError;
  }

  function removeFile(target: PendingImage): void {
    images = images.filter((p) => p.url !== target.url);
  }

  function handlePaste(e: ClipboardEvent): void {
    if (submitting) return;
    const files = imageFilesFromDataTransfer(e.clipboardData);
    if (files.length === 0) return; // plain-text paste falls through untouched
    e.preventDefault();
    void addFiles(files);
  }

  function handleDragEnter(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes("Files")) return; // text drags: ignore
    dragDepth += 1;
    dragging = true;
  }

  function handleDragLeave(): void {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragging = false;
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault(); // never let the browser navigate away on a miss-drop
    dragDepth = 0;
    dragging = false;
    if (submitting) return;
    void addFiles(rawFilesFromDataTransfer(e.dataTransfer));
  }

  /**
   * The attach affordance splits by pointer type (#13): touch devices get
   * the explicit source menu (camera vs library — Android PWA pickers skip
   * the camera and iOS's native sheet isn't guaranteed), pointers go
   * straight to the file system. On touch, a second tap toggles the menu
   * closed.
   */
  function openAttach(): void {
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) {
      fileEl?.click();
      return;
    }
    attachMenu = !attachMenu;
    if (attachMenu) void tick().then(() => menuFirstEl?.focus());
    else attachEl?.focus();
  }

  function closeAttachMenu(refocus = true): void {
    attachMenu = false;
    if (refocus) attachEl?.focus();
  }

  function chooseCamera(): void {
    attachMenu = false;
    cameraEl?.click();
  }

  function chooseGallery(): void {
    attachMenu = false;
    fileEl?.click();
  }

  function acceptMention(m: Mention): void {
    if (!taEl || !mention) return;
    const before = text.slice(0, mention.at);
    const after = text.slice(mention.end);
    const inserted = /\s/.test(m.name) ? `#[${m.name}] ` : `#${m.name} `;
    const next = before + inserted + after;
    const newCaret = (before + inserted).length;
    text = next;
    caretIndex = newCaret;
    mentionPos = null;
    void tick().then(() => {
      taEl?.focus();
      taEl?.setSelectionRange(newCaret, newCaret);
      grow();
    });
  }

  async function submit(close: boolean): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    submitting = true;
    try {
      const attachments = await Promise.all(
        images.map((p) => fileToImageAttachmentInput(p.file)),
      );
      await capture.submit(trimmed, attachments.length > 0 ? attachments : undefined);
      if (close) {
        text = "";
        images = [];
        void inbox.load();
        capture.hide();
        return;
      }
      const p = parseCapture(trimmed, new Date(), knownLensNames);
      captured = [
        { id: Date.now(), text: p.cleanText, parsed: p },
        ...captured,
      ].slice(0, 3);
      void inbox.load();
      resetInput();
    } catch (err) {
      error =
        err instanceof Error && err.message
          ? err.message
          : "Could not save. Your text is kept — try again.";
    } finally {
      submitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (mention && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionSel = (mentionSel + 1) % mentionMatches.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionSel = (mentionSel - 1 + mentionMatches.length) % mentionMatches.length;
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const choice = mentionMatches[mentionSel] ?? mentionMatches[0];
        if (choice) acceptMention(choice);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        mentionPos = null;
        return;
      }
    }
    if (e.key !== "Enter") return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      void submit(false);
    } else if (!e.shiftKey) {
      e.preventDefault();
      void submit(true);
    }
  }

  function syncCaret(el: HTMLTextAreaElement | HTMLInputElement): void {
    caretIndex = el.selectionStart ?? text.length;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== "Escape") return;
    if (attachMenu) {
      closeAttachMenu();
      return;
    }
    if (!(mention && mentionMatches.length > 0)) {
      capture.hide();
    }
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_interactive_supports_focus -->
<div
  class="aa-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Quick capture"
  onclick={() => capture.hide()}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="aa-overlay-card aa-capture{dragging ? " is-dragover" : ""}"
    bind:this={cardEl}
    onclick={(e) => {
      e.stopPropagation();
      // Outside-click closes the source menu — but never the same click
      // that opened it (the bubbling attach-button click) or one inside it.
      if (
        attachMenu &&
        !(e.target instanceof Element && e.target.closest(".aa-capture__actions"))
      ) {
        closeAttachMenu(false);
      }
    }}
    ondragenter={handleDragEnter}
    ondragleave={handleDragLeave}
    ondragover={(e) => e.preventDefault()}
    ondrop={handleDrop}
  >
    {#if captured.length > 0}
      <div class="aa-capture__captured" aria-live="polite">
        {#each captured as item (item.id)}
          <div class="aa-capture__captured-item">
            <span class="aa-capture__captured-check" aria-hidden="true">
              <svg viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6.5l2.5 2.5 4.5-5.5"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <span class="aa-capture__captured-text">{item.text}</span>
            <span class="aa-capture__captured-chips">
              {@render parsedChips(item.parsed, "captured")}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="aa-capture__head">
      <span class="aa-capture__mark">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="aa-brand-mark">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <textarea
        bind:this={taEl}
        rows={1}
        class="aa-capture__textarea"
        placeholder={'What\'s on your mind?  (try: "Email Sarah tomorrow #mvp !3")'}
        bind:value={text}
        oninput={(e) => {
          error = null;
          syncCaret(e.currentTarget);
          grow();
        }}
        onkeyup={(e) => syncCaret(e.currentTarget)}
        onclick={(e) => syncCaret(e.currentTarget)}
        onkeydown={handleKeydown}
        onpaste={handlePaste}
        disabled={submitting}
        aria-label="Capture"
      ></textarea>
      <button
        type="button"
        class="aa-overlay__close aa-capture__close"
        onclick={() => capture.hide()}
        aria-label="Close without saving"
        title="Close (Esc)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    {#if images.length > 0}
      <div class="aa-capture__attachments" aria-label="Images to attach">
        {#each images as p (p.url)}
          <span class="aa-capture__attachment">
            <img src={p.url} alt={p.file.name} draggable={false} />
            <button
              type="button"
              class="aa-overlay__close aa-capture__attachment-remove"
              onclick={() => removeFile(p)}
              aria-label="Remove {p.file.name}"
              title="Remove"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </span>
        {/each}
      </div>
    {/if}

    {#if mention && mentionMatches.length > 0 && mentionPos}
      <div
        class="aa-capture__mention"
        style="top: {mentionPos.top}px; left: {mentionPos.left}px;"
        role="listbox"
        aria-label="Projects"
      >
        {#each mentionMatches as m, i (m.name)}
          <button
            type="button"
            role="option"
            aria-selected={i === mentionSel}
            class="aa-capture__mention-item {i === mentionSel ? "active" : ""}"
            onmousedown={(e) => {
              e.preventDefault();
              acceptMention(m);
            }}
            onmouseenter={() => (mentionSel = i)}
          >
            <span class="aa-capture__mention-mark" aria-hidden="true">▣</span>
            <span class="aa-capture__mention-name">{m.name}</span>
            {#if m.lensName && m.lensName !== activeLensName}
              <span class="aa-capture__mention-lens">{m.lensName}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if parsed && (parsed.parsedScheduledDate || parsed.parsedSnoozedUntil || parsed.parsedPriority || parsed.parsedSize || parsed.parsedLens || parsed.parsedProject || parsed.parsedTags.length > 0)}
      <div class="aa-capture__preview">
        {@render parsedChips(parsed, "preview")}
      </div>
    {/if}

    <div class="aa-capture__foot">
      <span class="aa-capture__hint">
        {#if error}
          <span class="aa-capture__error" role="alert">{error}</span>
        {:else}
          <kbd class="aa-capture__kbd">⏎</kbd> save ·
          <kbd class="aa-capture__kbd">⌘⏎</kbd> add another ·
          <kbd class="aa-capture__kbd">Esc</kbd> close
        {/if}
      </span>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="aa-capture__actions"
        onkeydown={(e) => {
          // Menu-open Esc must die here: the Shell's global Escape router
          // would otherwise close the whole popover on the same keydown.
          if (e.key === "Escape" && attachMenu) {
            e.stopPropagation();
            closeAttachMenu();
          }
        }}
      >
        {#if attachMenu}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="aa-capture__attach-menu"
            role="menu"
            aria-label="Attach images from"
            onclick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              class="aa-capture__attach-menu-item"
              bind:this={menuFirstEl}
              onclick={chooseCamera}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.7" />
              </svg>
              Take photo
            </button>
            <button
              type="button"
              role="menuitem"
              class="aa-capture__attach-menu-item"
              onclick={chooseGallery}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.7" />
                <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.7" />
                <path
                  d="M21 15l-5-5L5 21"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              Choose from library
            </button>
          </div>
        {/if}
        <input
          bind:this={fileEl}
          class="aa-capture__file--gallery"
          type="file"
          accept="image/*"
          multiple
          hidden
          onchange={(e) => {
            void addFiles(Array.from(e.currentTarget.files ?? []));
            e.currentTarget.value = "";
          }}
        />
        <input
          bind:this={cameraEl}
          class="aa-capture__file--camera"
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onchange={(e) => {
            void addFiles(Array.from(e.currentTarget.files ?? []));
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          class="aa-capture__attach"
          bind:this={attachEl}
          onclick={openAttach}
          disabled={images.length >= MAX_CAPTURE_IMAGES || submitting}
          aria-label="Attach images"
          aria-haspopup="menu"
          aria-expanded={attachMenu}
          title="Attach images (up to {MAX_CAPTURE_IMAGES}, paste, or drop)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="aa-capture__save"
          disabled={!text.trim() || submitting}
          onclick={() => submit(true)}
        >
          Save
        </button>
      </div>
    </div>
  </div>
</div>

{#snippet parsedChips(parsed: ParsedCapture, variant: "preview" | "captured")}
  {@const verbose = variant === "preview"}
  {@const tags = verbose ? parsed.parsedTags : parsed.parsedTags.slice(0, 2)}
  {#if parsed.parsedLens}
    <Chip variant="teal" small>[[{parsed.parsedLens}]]</Chip>
  {/if}
  {#if parsed.parsedScheduledDate}
    <Chip variant="teal" small>
      {#if verbose}📅 {formatRelativeDay(parsed.parsedScheduledDate)}{:else}{formatRelativeDay(parsed.parsedScheduledDate)}{/if}
    </Chip>
  {/if}
  {#if parsed.parsedSnoozedUntil}
    <Chip variant="teal" small>
      {#if verbose}snoozed until {formatSnoozedUntil(parsed.parsedSnoozedUntil)}{:else}{formatSnoozedUntil(parsed.parsedSnoozedUntil)}{/if}
    </Chip>
  {/if}
  {#if parsed.parsedProject}
    <Chip variant="teal" small>▣ {parsed.parsedProject}</Chip>
  {/if}
  {#if parsed.parsedPriority === "IMPORTANT"}
    <Chip variant="amber" small>{#if verbose}★ Important{:else}★{/if}</Chip>
  {/if}
  {#if verbose && parsed.parsedPriority === "LOW"}
    <Chip variant="muted" small>low</Chip>
  {/if}
  {#if verbose && parsed.parsedSize}
    <Chip variant="default" small>{parsed.parsedSize}</Chip>
  {/if}
  {#each tags as t (t)}
    <Chip variant="violet" small>{t}</Chip>
  {/each}
{/snippet}
