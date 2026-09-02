<script lang="ts">
  /**
   * /share — the PWA share-target review page (S12). Ported from
   * webapp/src/share/SharePage.tsx (the parity checklist lives in
   * packages/contract/src/s12-push-pwa/README.md §3.3).
   *
   * Flow: the service worker intercepts the OS share `POST /share`, stashes
   * the form in IndexedDB, and lands here with `?pending=<id>`. The page
   * previews the capture, offers optional title/note/destination edits, and
   * ONLY on confirm calls the normal authenticated ops (Inbox →
   * inbox.create through triage; Project → resources.create; Simple list →
   * tasks.createListItem — both direct, entitlement-gated server-side).
   * "Not now" discards the stash. Nothing reaches the server until confirm.
   *
   * Direct-route outcomes render here too: `?error=empty|server` and a
   * missing/unreadable `?pending=` id get the webapp's exact error copy.
   * `?id=<itemId>` (the /api/share 303 target) shows the captured
   * confirmation — the webapp rendered the same "Couldn't find that
   * capture." card for it; the id is fire-and-forget there (error map miss).
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import {
    composeShareCapture,
    composeShareText,
    clearPendingShare,
    getPendingShare,
    blobToBase64,
    createInboxCapture,
    createProjectResource,
    createSimpleListItem,
    loadResolverProjects,
    fileToDataUrl,
    type PendingShareImage,
    type ResolverProject,
    type ShareFields,
  } from "../../lib/share";

  const MISSING_ERROR_COPY = "Couldn't find that capture.";
  const ERROR_COPY = new Map<string, string>([
    ["empty", "Nothing to capture."],
    ["server", "Capture failed — try again."],
    ["missing", MISSING_ERROR_COPY],
  ]);

  type PendingState = { id: string; fields: ShareFields; files: PendingShareImage[] } | null;
  type Destination = "" | `project:${string}` | `list:${string}`;

  const pendingId = $derived(new URL(page.url.href).searchParams.get("pending") ?? null);
  const errorParam = $derived(new URL(page.url.href).searchParams.get("error") ?? "");

  let pending = $state<PendingState>(null);
  // The ?pending= effect below sets this on mount; it starts false so the
  // no-pending error card never flashes behind a load.
  let loadingPending = $state<boolean>(false);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let title = $state("");
  let description = $state("");
  let destination = $state<Destination>("");
  let projects = $state<ResolverProject[]>([]);
  /** data: URL previews keyed by `${filename}-${size}` (data:, never blob: —
   *  the deploy host CSP allows data: images only). */
  let previews = $state<Record<string, string>>({});

  onMount(() => {
    void loadResolverProjects()
      .then((rows) => {
        projects = rows;
      })
      .catch(() => {
        // The dropdown degrades to Inbox-only; the confirm paths re-validate.
      });
  });

  // Load the pending stash when ?pending= changes.
  $effect(() => {
    const id = pendingId;
    if (!id) {
      loadingPending = false;
      return;
    }
    loadingPending = true;
    let mounted = true;
    getPendingShare(id)
      .then((stored) => {
        if (mounted) {
          pending = stored
            ? { id: stored.id, fields: stored.fields, files: stored.files ?? [] }
            : null;
        }
      })
      .catch(() => {
        if (mounted) pending = null;
      })
      .finally(() => {
        if (mounted) loadingPending = false;
      });
    return () => {
      mounted = false;
    };
  });

  // Pre-fill title/description from the composed capture (once per pending).
  let prefilledFor = $state<string | null>(null);
  $effect(() => {
    if (!pending || prefilledFor === pending.id) return;
    const capture = composeShareCapture(pending.fields);
    title = capture.title;
    description = capture.content;
    prefilledFor = pending.id;
    // Previews (best-effort — an unreadable blob shows no preview, not an error).
    const next: Record<string, string> = {};
    for (const file of pending.files) {
      void fileToDataUrl(file.blob)
        .then((url) => {
          previews = { ...previews, [previewKey(file)]: url };
        })
        .catch(() => {
          // No preview for an unreadable blob.
        });
    }
    void next;
  });

  function previewKey(file: PendingShareImage): string {
    return `${file.filename}-${file.size}`;
  }

  const capture = $derived(pending ? composeShareCapture(pending.fields) : null);
  const listProjects = $derived(projects.filter((p) => p.type === "SIMPLE_LIST"));
  const standardProjects = $derived(projects.filter((p) => p.type !== "SIMPLE_LIST"));
  const selectedList = $derived(
    destination.startsWith("list:")
      ? listProjects.find((p) => p.id === destination.slice("list:".length)) ?? null
      : null,
  );
  const selectedProject = $derived(
    destination.startsWith("project:")
      ? standardProjects.find((p) => p.id === destination.slice("project:".length)) ?? null
      : null,
  );
  const assignedDestination = $derived(selectedList ?? selectedProject);
  const confirmLabel = $derived(
    submitting
      ? "Adding…"
      : selectedList
        ? "Add to list"
        : selectedProject
          ? "Add to project"
          : "Add to Inbox",
  );
  const reassurance = $derived(
    assignedDestination
      ? `It will be added directly to this ${selectedList ? "list" : "project"}.`
      : "Nothing is organized or scheduled yet.",
  );

  async function confirmPending(): Promise<void> {
    if (!pending) return;
    submitting = true;
    submitError = null;
    try {
      const composed = composeShareCapture(pending.fields);
      const text = composeShareText({ ...pending.fields, title });
      if (!text && pending.files.length === 0) throw new Error("Nothing to capture.");
      const [destinationType, destinationId] = destination.split(":", 2);

      if (destinationType === "list" && destinationId) {
        const listProject = projects.find(
          (project) => project.id === destinationId && project.type === "SIMPLE_LIST",
        );
        if (!listProject) throw new Error("Couldn't find that list.");
        await createSimpleListItem({
          projectId: listProject.id,
          text: text || pending.files[0]?.filename || "Shared image",
          content: description.trim() || undefined,
          sourceUrl: composed.url || undefined,
        });
        await clearPendingShare(pending.id);
        await goto(`/do/projects/${listProject.permalink}`, { replaceState: true });
        return;
      }

      // A shared item assigned to a project is reference material, not a
      // decision waiting to happen: it files straight in as a Resource — no
      // triage, same as the list branch. The Inbox is the only destination
      // that goes through triage.
      if (destinationType === "project" && destinationId) {
        const targetProject = projects.find(
          (project) => project.id === destinationId && project.type !== "SIMPLE_LIST",
        );
        if (!targetProject) throw new Error("Couldn't find that project.");
        // Resource URLs must be http(s); a rare non-http share source (some
        // Android apps share content:// or intent:// URIs) folds into the
        // notes rather than failing the save.
        const httpUrl = /^https?:\/\//i.test(composed.url) ? composed.url : undefined;
        const notes =
          [description.trim(), httpUrl ? undefined : composed.url || undefined]
            .filter(Boolean)
            .join("\n\n") || undefined;
        await createProjectResource({
          projectId: targetProject.id,
          title: title.trim() || text || pending.files[0]?.filename || "Shared item",
          url: httpUrl,
          notes,
        });
        await clearPendingShare(pending.id);
        await goto(`/do/projects/${targetProject.permalink}`, { replaceState: true });
        return;
      }

      // Use the normal authenticated capture op, not a cross-origin share
      // API: the Inbox reads through the same operation, so a confirmed item
      // cannot be written under a different stale cookie session.
      const created = await createInboxCapture({
        text: text || pending.files[0]?.filename || "Shared image",
        title: title.trim() || undefined,
        content: description.trim() || undefined,
        sourceUrl: composed.url || undefined,
      });
      await clearPendingShare(pending.id);
      // `?item=` is the Inbox page's scroll/highlight contract.
      await goto(`/do/inbox?item=${encodeURIComponent(created.id)}`, { replaceState: true });
    } catch (err) {
      submitError = err instanceof Error ? err.message : "Could not add this to your inbox.";
    } finally {
      submitting = false;
    }
  }

  async function discardPending(): Promise<void> {
    if (pending) await clearPendingShare(pending.id);
    await goto("/do", { replaceState: true });
  }

  function sourceLabel(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    } catch {
      // Share payloads may contain a non-standard URL. Keep the original
      // visible rather than hiding a source the user chose to capture.
      return url;
    }
  }
</script>

{#if loadingPending}
  <main class="aa-share"><div class="aa-share__card"><h1 class="aa-share__title">Preparing capture…</h1></div></main>
{:else if pendingId && pending && capture}
  {#if !capture.text && pending.files.length === 0}
    <main class="aa-share">
      <div class="aa-share__card">
        <h1 class="aa-share__title">{ERROR_COPY.get("empty") ?? MISSING_ERROR_COPY}</h1>
        <a class="aa-share__link" href="/do">Back to ActionAmp</a>
      </div>
    </main>
  {:else}
    <main class="aa-share">
      <div class="aa-share__card aa-share__card--review">
        <header class="aa-share__header">
          <span class="aa-share__brand" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="aa-share__brand-name">ActionAmp</span>
          <span class="aa-share__destination">
            {#if assignedDestination}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4h3l1.5 8h6L14 6H5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="6.5" cy="13.5" r="1" fill="currentColor" />
                <circle cx="11.5" cy="13.5" r="1" fill="currentColor" />
              </svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            {/if}
            {assignedDestination?.name ?? "Inbox"}
          </span>
        </header>

        <div class="aa-share__intro">
          <h1 class="aa-share__title aa-share__title--intro">Keep this for later.</h1>
        </div>

        <section class="aa-share__preview" aria-label="Shared item preview">
          <div class="aa-share__preview-label">
            <span class="aa-share__preview-dot" aria-hidden="true"></span>
            Ready to capture
          </div>
          {#if capture.url}
            <div class="aa-share__source" title={capture.url}>
              <span class="aa-share__source-icon" aria-hidden="true">↗</span>
              <span class="aa-share__source-label">Source</span>
              <span class="aa-share__source-url">{sourceLabel(capture.url)}</span>
            </div>
          {/if}
          {#each pending.files as file (previewKey(file))}
            {#if previews[previewKey(file)]}
              <img class="aa-share__image" src={previews[previewKey(file)]} alt="" />
            {/if}
          {/each}
        </section>
        <section class="aa-share__details" aria-label="Optional capture details">
          <input
            class="aa-share__title-input"
            type="text"
            bind:value={title}
            placeholder="Title"
            aria-label="Title (optional)"
          />
          <textarea
            class="aa-share__description-input"
            bind:value={description}
            placeholder="Add a note — why you saved this, or what to do with it"
            aria-label="Description (optional)"
            rows="3"
          ></textarea>
          <label class="aa-share__field">
            <span>Where should this go? <em>optional</em></span>
            <select bind:value={destination}>
              <option value="">Inbox — decide later</option>
              {#if standardProjects.length > 0}
                <optgroup label="Projects">
                  {#each standardProjects as project (project.id)}
                    <option value={`project:${project.id}`}>
                      {project.name}{project.lensName ? ` · ${project.lensName}` : ""}
                    </option>
                  {/each}
                </optgroup>
              {/if}
              {#if listProjects.length > 0}
                <optgroup label="Simple lists">
                  {#each listProjects as project (project.id)}
                    <option value={`list:${project.id}`}>
                      {project.name}{project.lensName ? ` · ${project.lensName}` : ""}
                    </option>
                  {/each}
                </optgroup>
              {/if}
            </select>
          </label>
        </section>
        {#if submitError}<p class="aa-share__error" role="alert">{submitError}</p>{/if}
        <div class="aa-share__actions">
          <button class="aa-share__button" type="button" onclick={() => void confirmPending()} disabled={submitting}>
            {confirmLabel}
            {#if !submitting}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {/if}
          </button>
          <button class="aa-share__link aa-share__link--button" type="button" onclick={() => void discardPending()}>
            Not now
          </button>
        </div>
        <p class="aa-share__reassurance">{reassurance}</p>
      </div>
    </main>
  {/if}
{:else}
  <main class="aa-share">
    <div class="aa-share__card">
      <h1 class="aa-share__title">{ERROR_COPY.get(errorParam) ?? MISSING_ERROR_COPY}</h1>
      <a class="aa-share__link" href="/do">Back to ActionAmp</a>
    </div>
  </main>
{/if}

<style>
  /* Full-screen /share confirmation page — ported from webapp
     SharePage.css (same look). Self-contained: /share is the PWA's
     share-target cold-launch surface, so the keyframes live here. */
  @keyframes aa-share-slidein {
    from {
      opacity: 0;
      transform: translateX(-6px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .aa-share {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--aa-space-xl) var(--aa-space-md);
    background: var(--aa-bg);
  }

  .aa-share__card {
    width: 100%;
    max-width: 460px;
    animation: aa-share-slidein 220ms var(--aa-ease-out, ease-out) both;
  }

  .aa-share__card:not(.aa-share__card--review) {
    text-align: center;
  }

  .aa-share__card--review {
    text-align: left;
  }

  .aa-share__header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: var(--aa-space-lg);
    color: var(--aa-text-3);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
  }

  .aa-share__brand {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--aa-radius-sm);
    background: var(--aa-teal);
    color: var(--aa-surface);
    box-shadow: 0 3px 10px var(--aa-teal-tint-shadow);
  }

  .aa-share__brand-name {
    color: var(--aa-text-2);
  }

  .aa-share__destination {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    color: var(--aa-text-4);
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-medium);
  }

  .aa-share__intro {
    margin-bottom: var(--aa-space-lg);
  }

  .aa-share__title {
    font-size: clamp(1.7rem, 7vw, 2.15rem);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: -0.035em;
    line-height: var(--aa-leading-tight);
    color: var(--aa-text);
    margin: 0;
  }

  .aa-share__title--intro {
    font-size: clamp(0.85rem, 3.5vw, 1.075rem);
    letter-spacing: normal;
    line-height: var(--aa-leading-snug);
    color: var(--aa-text-2);
  }

  .aa-share__preview {
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-lg);
    background: var(--aa-surface);
    box-shadow: var(--aa-shadow-sm);
    padding: var(--aa-space-md);
  }

  .aa-share__preview-label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 var(--aa-space-md);
    color: var(--aa-text-3);
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .aa-share__preview-dot {
    width: 7px;
    height: 7px;
    border-radius: var(--aa-radius-full);
    background: var(--aa-teal);
    box-shadow: 0 0 0 3px var(--aa-teal-soft-strong);
  }

  .aa-share__source {
    display: flex;
    align-items: center;
    gap: var(--aa-space-xs);
    min-width: 0;
    margin-top: var(--aa-space-md);
    padding-top: var(--aa-space-md);
    border-top: 1px solid var(--aa-border);
    color: var(--aa-text-3);
    font-size: var(--aa-text-sm);
  }

  .aa-share__preview-label + .aa-share__source {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .aa-share__source-icon {
    color: var(--aa-teal-cta);
    font-size: var(--aa-text-md);
    line-height: 1;
  }

  .aa-share__source-label {
    color: var(--aa-text-4);
  }

  .aa-share__source-url {
    overflow: hidden;
    color: var(--aa-text-2);
    font-weight: var(--aa-weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aa-share__image {
    display: block;
    width: 100%;
    max-height: 280px;
    margin-top: var(--aa-space-md);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-md);
    object-fit: contain;
  }

  .aa-share__details {
    display: grid;
    gap: var(--aa-space-md);
    margin-top: var(--aa-space-lg);
  }

  .aa-share__title-input,
  .aa-share__description-input {
    width: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--aa-text);
    font: inherit;
    padding: 0;
  }

  .aa-share__title-input {
    font-size: clamp(1.55rem, 6.5vw, 1.95rem);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: -0.035em;
    line-height: var(--aa-leading-tight);
  }

  .aa-share__description-input {
    resize: vertical;
    color: var(--aa-text-2);
    font-size: var(--aa-text-md);
    line-height: var(--aa-leading-relaxed);
  }

  .aa-share__title-input::placeholder,
  .aa-share__description-input::placeholder {
    color: var(--aa-text-4);
    font-weight: var(--aa-weight-normal);
    letter-spacing: normal;
  }

  .aa-share__title-input:focus-visible,
  .aa-share__description-input:focus-visible {
    outline: none;
    box-shadow: inset 0 -2px 0 var(--aa-teal-cta);
  }

  .aa-share__field {
    display: grid;
    gap: var(--aa-space-xs);
    color: var(--aa-text-2);
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-medium);
  }

  .aa-share__field em {
    color: var(--aa-text-4);
    font-size: var(--aa-text-xs);
    font-style: normal;
    font-weight: var(--aa-weight-normal);
  }

  .aa-share__field select {
    width: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--aa-text);
    font: inherit;
    line-height: var(--aa-leading-normal);
    padding: var(--aa-space-xs) 0;
  }

  .aa-share__field select:focus-visible {
    outline: 2px solid var(--aa-teal-cta);
    outline-offset: 3px;
  }

  .aa-share__actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--aa-space-sm);
    margin-top: var(--aa-space-lg);
  }

  .aa-share__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--aa-space-sm);
    width: 100%;
    min-height: 44px;
    border: 1px solid transparent;
    border-radius: var(--aa-radius-sm);
    background: var(--aa-teal-cta);
    color: var(--aa-surface);
    cursor: pointer;
    font: inherit;
    font-size: var(--aa-text-sm);
    font-weight: 600;
    padding: 10px var(--aa-space-md);
    box-shadow: 0 4px 14px var(--aa-teal-tint-shadow);
    transition:
      background var(--aa-dur-fast) var(--aa-ease-out),
      transform var(--aa-dur-fast) var(--aa-ease-out);
  }

  .aa-share__button svg:last-child {
    margin-left: auto;
  }

  .aa-share__button:disabled {
    cursor: default;
    opacity: 0.65;
  }

  .aa-share__error {
    color: var(--aa-rose, #b3455a);
    font-size: var(--aa-text-sm);
    margin: var(--aa-space-sm) 0 0;
  }

  .aa-share__link {
    display: inline-block;
    margin-top: var(--aa-space-sm);
    font-size: var(--aa-text-sm);
    color: var(--aa-teal-cta);
    text-decoration: none;
  }

  .aa-share__link:hover {
    text-decoration: underline;
  }

  .aa-share__link--button {
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
    margin: 0;
    padding: var(--aa-space-xs);
    color: var(--aa-text-3);
    text-align: center;
  }

  .aa-share__reassurance {
    margin: var(--aa-space-md) 0 0;
    color: var(--aa-text-4);
    font-size: var(--aa-text-xs);
    text-align: center;
  }

  .aa-share__button:hover:not(:disabled) {
    background: var(--aa-teal-cta-hover);
  }

  .aa-share__button:active:not(:disabled) {
    transform: translateY(1px);
  }

  .aa-share__button:focus-visible,
  .aa-share__link--button:focus-visible {
    outline: none;
    box-shadow: var(--aa-focus-ring);
  }

  @media (max-width: 380px) {
    .aa-share {
      align-items: flex-start;
    }

    .aa-share__header {
      margin-bottom: var(--aa-space-md);
    }
  }
</style>
