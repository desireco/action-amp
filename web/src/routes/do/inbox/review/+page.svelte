<script lang="ts">
  /**
   * Triage — define each captured thing, one at a time (S3). Ported from
   * webapp/src/inbox/TriagePage.tsx + useTriageKeyboard.ts.
   *
   * Per-item wizard: 1 · Classify (type + lens/destination) → 2 · Spec
   * (inline-expanding property rows) → Ready (commits the spec). The exit
   * animation encodes the decision (OUTCOME_EXIT); the walkthrough navigates
   * a FIXED snapshot of the queue taken on first arrival, so post-dispatch
   * refreshes can't shift indices or skip items.
   *
   * `?i=N` (an inbox row click) seeds the START position — the queue is
   * rotated so item N is first, then wraps — read ONCE (non-reactive) so a
   * stale URL value can't yank the index.
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import TriageCard from "../../../../lib/components/TriageCard.svelte";
  import PropertyChips from "../../../../lib/components/PropertyChips.svelte";
  import Icon from "../../../../lib/components/Icon.svelte";
  import { client } from "../../../../lib/api";
  import { inbox } from "../../../../lib/stores/inbox.svelte";
  import {
    lenses as lensStore,
    entitlementDefaultLensId,
  } from "../../../../lib/stores/lenses.svelte";
  import { prefs } from "../../../../lib/stores/prefs.svelte";
  import {
    OUTCOME_EXIT,
    buildDispatchPayload,
    buildTriageChips,
    canComplete as canCompleteWorking,
    chipPickToWorkingPatch,
    projectFields,
    resolveProjectCandidate,
    resourceFields,
    summaryFor,
    taskFields,
    type ChosenType,
    type Step,
    type TriageExit,
    type Working,
  } from "../../../../lib/triage/flow";
  import { formatAgo, isSameDay } from "../../../../lib/format/dates";
  import { currentPlainDate } from "../../../../lib/taskView";

  import "../../../../lib/styles/TriagePage.css";
  import "../../../../lib/styles/TriageCard.css";
  import "../../../../lib/styles/Chip.css";
  import "../../../../lib/styles/Overlays.css";

  /** Debounce for writing an in-triage capture edit back to the InboxItem. */
  const TEXT_SAVE_DEBOUNCE_MS = 600;

  const SIZE_ORDER = ["S", "M", "L", "XL"] as const;
  const PRIORITY_ORDER = ["LOW", "NORMAL", "IMPORTANT"] as const;
  const WHEN_ORDER = ["Today", "Upcoming", "Someday"] as const;

  const TRIAGE_TYPES = [
    { t: "task", label: "Task", sub: "an action — something to do", icon: "star" },
    { t: "list-item", label: "List item", sub: "a flat item to check off", icon: "box" },
    { t: "resource", label: "Resource", sub: "a link or reference — not an action", icon: "logbook" },
    { t: "project", label: "Project", sub: "an outcome needing more than one step", icon: "projects" },
    { t: "delete", label: "Delete", sub: "get rid of it — not kept", icon: "trash" },
  ] as const;

  interface LensLike {
    id: string;
    name: string;
    color?: string | null;
    isIncluded?: boolean;
  }
  interface ResolverProject {
    id: string;
    name: string;
    permalink: string;
    type: "STANDARD" | "SIMPLE_LIST";
    lensId: string;
    lensName: string | null;
    lensColor: string | null;
  }

  // Seed position from `?i=N` once on first arrival (non-reactive on purpose).
  const startIdx = (() => {
    const n = Number(new URL(page.url.href).searchParams.get("i"));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  })();

  // ---- Wizard state ----
  let idx = $state(0);
  let exit = $state<TriageExit>(null);
  let dispatched = $state(false);
  let entering = $state(false);
  let error = $state<string | null>(null);
  let editingBody = $state(false);
  let step = $state<Step>("classify");
  let chosenLensId = $state<string | null>(null);
  let working = $state<Working | null>(null);
  let chipOpen = $state(false);
  let initializedItemId = $state<string | null>(null);
  let lensTouched = $state(false);
  let listProjectId = $state<string | null>(null);

  // ---- Data (the app-data surface composes with the shell later; the
  // inbox fragment's supporting reads cover the wizard today) ----
  let lenses = $state<LensLike[]>([]);
  let resolverProjects = $state<ResolverProject[]>([]);
  let snapshot = $state<typeof inbox.items | null>(null);

  onMount(() => {
    if (inbox.items.length === 0) void inbox.load();
    void client.inbox
      .lenses()
      .then((rows) => {
        lenses = rows;
      })
      .catch(() => {});
    void client.inbox
      .projectsForResolver()
      .then((rows) => {
        resolverProjects = rows;
      })
      .catch(() => {});
  });

  // Snapshot the list on first arrival — the walkthrough navigates this FIXED
  // queue, not the refetching store (the race guard webapp encoded).
  $effect(() => {
    if (!snapshot && inbox.items.length > 0) snapshot = [...inbox.items];
  });

  const triageList = $derived.by(() => {
    const queue = snapshot ?? inbox.items;
    if (queue.length === 0 || startIdx === 0) return queue;
    const pivot = Math.min(startIdx, queue.length);
    return [...queue.slice(pivot), ...queue.slice(0, pivot)];
  });

  const total = $derived(triageList.length);
  const isComplete = $derived(idx >= total);
  const item = $derived(triageList[idx] ?? null);
  const shortText = $derived(
    item ? (item.text.length > 40 ? item.text.slice(0, 40) + "…" : item.text) : "",
  );

  const triageChips = $derived(buildTriageChips(item));

  // ---- Project + lens resolution (grammar v2 paths) ----
  const defaultLensId = $derived.by(() => {
    if (lensStore.activeLensId && lenses.some((l) => l.id === lensStore.activeLensId)) {
      return lensStore.activeLensId;
    }
    // Mirror the shell's entitlement-aware default (NOT included-first): the
    // wizard snaps chosenLensId per item, so the pre-shell-load fallback must
    // agree with where the shell will land.
    return entitlementDefaultLensId(lenses, prefs.account);
  });
  const scopedLensId = $derived(chosenLensId ?? defaultLensId);
  const scopedProjects = $derived(
    resolverProjects.filter(
      (p) => p.lensId === scopedLensId && p.type !== "SIMPLE_LIST",
    ),
  );
  const structuredProjects = $derived(scopedProjects);
  const goals: { id: string; name: string }[] = [];

  const resolvedProjectId = $derived.by(() => {
    if (!item) return null;
    if (item.parsedProjectId) {
      return structuredProjects.some((p) => p.id === item.parsedProjectId)
        ? item.parsedProjectId
        : null;
    }
    return (
      resolveProjectCandidate(structuredProjects, {
        parsedProject: item.parsedProject,
        text: item.text,
      })?.id ?? null
    );
  });

  const inferredLensFromToken: LensLike | null = $derived.by(() => {
    if (!item) return null;
    if (item.parsedLensId) {
      return lenses.find((l) => l.id === item.parsedLensId) ?? null;
    }
    const token = item.parsedLens;
    if (!token) return null;
    return lenses.find((l) => l.name.toLowerCase() === token) ?? null;
  });

  const projectBridge = $derived.by<{
    projectId: string;
    lensId: string;
    projectName: string;
    projectType: string;
  } | null>(() => {
    if (!item) return null;
    const all = resolverProjects;
    if (all.length === 0) return null;
    const directlySelected = item.parsedProjectId
      ? all.find((p) => p.id === item.parsedProjectId)
      : null;
    if (directlySelected) {
      return {
        projectId: directlySelected.id,
        lensId: directlySelected.lensId,
        projectName: directlySelected.name,
        projectType: directlySelected.type,
      };
    }
    const match = resolveProjectCandidate(all, {
      parsedProject: item.parsedProject,
      text: item.text,
    });
    return match
      ? { projectId: match.id, lensId: match.lensId, projectName: match.name, projectType: match.type }
      : null;
  });

  const projectDestinationLens: LensLike | null = $derived(
    projectBridge ? lenses.find((l) => l.id === projectBridge.lensId) ?? null : null,
  );
  const hasExplicitProjectDestination = $derived(
    !!item?.parsedProjectId && !!projectBridge && !!projectDestinationLens,
  );
  const inferredLens = $derived(
    hasExplicitProjectDestination
      ? projectDestinationLens
      : inferredLensFromToken ?? projectDestinationLens ?? null,
  );
  const hasProjectDestination = $derived(
    hasExplicitProjectDestination ||
      (!inferredLensFromToken && !!projectBridge && !!projectDestinationLens),
  );
  const isListDestination = $derived(
    hasProjectDestination && projectBridge?.projectType === "SIMPLE_LIST",
  );
  const lensInferenceLabel = $derived.by(() => {
    if (hasExplicitProjectDestination) return `selected project ${projectBridge?.projectName}`;
    if (item?.parsedLensId && inferredLensFromToken) return `selected ${inferredLensFromToken.name}`;
    if (inferredLensFromToken) return `from [[${item?.parsedLens}]] in your capture`;
    if (projectBridge && inferredLens) return `from project ${projectBridge.projectName}`;
    return null;
  });

  const listProjects = $derived(resolverProjects.filter((p) => p.type === "SIMPLE_LIST"));

  // The full menu always renders — a matched list is a DEFAULT, not a mode. A
  // captured/resolved STRUCTURED project means this is a task *in* that
  // project by default, not a new project by the same name.
  const classifyTypes = $derived(
    TRIAGE_TYPES.filter(
      ({ t }) =>
        !(
          t === "project" &&
          (item?.parsedProject || hasProjectDestination) &&
          !isListDestination
        ),
    ),
  );

  /** Precedence on defaults: capture-parser token > app default (never auto-Today
   *  EXCEPT an explicit today/tonight capture token — intent, not default). */
  function initWorking(current: typeof item): Working {
    return {
      type: "task",
      title: current?.text ?? "",
      when:
        current?.parsedScheduledDate &&
        isSameDay(current.parsedScheduledDate, currentPlainDate().toString())
          ? "Today"
          : "Upcoming",
      size: current?.parsedSize ?? "M",
      priority: current?.parsedPriority ?? "NORMAL",
      content: "",
      projectId: null,
      projectGoalId: null,
      due: "—",
      parentProjectId: null,
      kind: "Link",
    };
  }

  // Reset the wizard for the current item whenever the index advances.
  $effect(() => {
    if (!item) return;
    if (initializedItemId === item.id) return;
    initializedItemId = item.id;
    lensTouched = false;
    step = "classify";
    chosenLensId = inferredLens?.id ?? defaultLensId;
    working = {
      ...initWorking(item),
      type:
        hasProjectDestination && projectBridge?.projectType === "SIMPLE_LIST"
          ? "list-item"
          : "task",
      projectId:
        hasProjectDestination && projectBridge?.projectType !== "SIMPLE_LIST"
          ? projectBridge?.projectId ?? null
          : null,
    };
    listProjectId =
      hasProjectDestination && projectBridge?.projectType === "SIMPLE_LIST"
        ? projectBridge.projectId
        : null;
    chipOpen = false;
    editingBody = false;
  });

  // Late lens inference: the resolver loads async; follow it until the user
  // touches the lens choice (and only while still on Classify).
  $effect(() => {
    if (!item || step !== "classify" || lensTouched) return;
    const targetLensId = inferredLens?.id ?? defaultLensId;
    if (!targetLensId) return;
    if (!chosenLensId || chosenLensId === defaultLensId) chosenLensId = targetLensId;
  });

  // Late project-bridge: route a SIMPLE_LIST destination into the one-step
  // list-item flow; link a structured project otherwise.
  $effect(() => {
    if (!item || !hasProjectDestination || !projectBridge || !projectDestinationLens) return;
    chosenLensId = projectDestinationLens.id;
    if (projectBridge.projectType === "SIMPLE_LIST") {
      listProjectId = projectBridge.projectId;
      if (working && working.type !== "list-item" && working.type !== "delete") {
        working = { ...working, type: "list-item", projectId: null };
      }
      return;
    }
    if (working && working.projectId !== projectBridge.projectId) {
      working = { ...working, projectId: projectBridge.projectId };
    }
  });

  function setW(patch: Partial<Working>): void {
    if (working) working = { ...working, ...patch };
  }

  const canComplete = $derived(canCompleteWorking(working, chosenLensId, listProjectId));

  const classifyLensOptions = $derived(
    lenses.length > 0
      ? lenses
      : [
          { id: "Work", name: "Work", color: "indigo" },
          { id: "Me", name: "Me", color: "emerald" },
        ],
  );

  function selectLensByIndex(index: number): void {
    if (hasProjectDestination) return;
    const lens = classifyLensOptions[index];
    if (!lens) return;
    lensTouched = true;
    chosenLensId = lens.id;
  }

  function cycleValue<T extends string>(value: T, order: readonly T[], stepDir: 1 | -1): T {
    const i = order.indexOf(value);
    if (i === -1) return order[0];
    return order[(i + stepDir + order.length) % order.length];
  }

  // ---- In-triage capture edits: persist back to the InboxItem (~600ms
  // debounce; flushed on item-advance + unmount; never blanks the item) ----
  let pendingTextSave: { id: string; text: string; timer: ReturnType<typeof setTimeout> } | null = null;
  function flushTextSave(): void {
    const pending = pendingTextSave;
    if (!pending) return;
    pendingTextSave = null;
    clearTimeout(pending.timer);
    // Calm failure: the working title already carries the edit; if dispatch
    // raced the item's deletion, the UNPROCESSED guard no-ops it.
    void client.inbox
      .update({ inboxItemId: pending.id, text: pending.text })
      .then(() => inbox.load())
      .catch(() => {});
  }
  function scheduleTextSave(id: string, value: string): void {
    const trimmed = value.trim();
    if (!trimmed) return; // never blank out the stored item
    if (pendingTextSave) clearTimeout(pendingTextSave.timer);
    const timer = setTimeout(() => flushTextSave(), TEXT_SAVE_DEBOUNCE_MS);
    pendingTextSave = { id, text: trimmed, timer };
  }
  $effect(() => () => flushTextSave());
  $effect(() => {
    // Advancing the walkthrough flushes the pending edit (the saved id
    // changes; reading it here tracks the current item).
    if (item?.id) flushTextSave();
    else flushTextSave();
  });

  async function dispatch(): Promise<void> {
    if (idx >= total || exit || !working || !chosenLensId || !item) return;
    const payload = buildDispatchPayload(working, {
      inboxItemId: item.id,
      lensId: chosenLensId,
      resolvedProjectId,
      listProjectId,
    });
    dispatched = true;
    exit = OUTCOME_EXIT[payload.decision];
    try {
      await client.inbox.triage(payload);
      await inbox.load();
      error = null;
    } catch (e) {
      // A network-level failure means the request never reached the server —
      // the item is untouched; say so calmly instead of surfacing the raw
      // fetch error.
      const message = e instanceof Error ? e.message : "";
      error = /network error|failed to fetch|err_(network|connection)/i.test(message)
        ? "Couldn't reach the server — it may be restarting. Try again in a moment."
        : message || "Triage failed.";
      dispatched = false;
      exit = null;
      return;
    }
    setTimeout(() => (dispatched = false), 200);
    setTimeout(() => {
      exit = null;
      entering = true;
      idx += 1;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => (entering = false));
      });
    }, 320);
  }

  // ---- Triage keymap (window-level; TRIAGE.md §7) ----
  function onKey(e: KeyboardEvent): void {
    if (isComplete || !item) return;

    // While a chip popover or picker sheet is open: only Escape closes it
    // (the chip editor owns its own Escape); property keys are suppressed.
    if (chipOpen) {
      return;
    }

    if (e.key === "Escape") {
      if (step === "classify") {
        void goto("/do/inbox");
      } else {
        step = "classify";
      }
      return;
    }

    const el = document.activeElement;
    const editingTitle =
      el?.getAttribute("contenteditable") === "true" ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement;
    if (editingTitle) return;

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // Spec step property keys (task only): [ / ] size, - / = priority, H when.
    if (step === "spec" && working?.type === "task") {
      const w = working;
      switch (e.key) {
        case "[":
          e.preventDefault();
          setW({ size: cycleValue(w.size, SIZE_ORDER, -1) });
          return;
        case "]":
          e.preventDefault();
          setW({ size: cycleValue(w.size, SIZE_ORDER, 1) });
          return;
        case "-":
          e.preventDefault();
          setW({ priority: cycleValue(w.priority, PRIORITY_ORDER, -1) });
          return;
        case "=":
        case "+":
          e.preventDefault();
          setW({ priority: cycleValue(w.priority, PRIORITY_ORDER, 1) });
          return;
        case "h":
        case "H":
          e.preventDefault();
          setW({ when: cycleValue(w.when, WHEN_ORDER, 1) });
          return;
      }
    }

    if (step === "classify") {
      // Number keys mirror the visual order of TRIAGE_TYPES.
      const typeByKey: Record<string, ChosenType> = {
        "1": "task",
        "2": "list-item",
        "3": "resource",
        "4": "project",
        "5": "delete",
      };
      const lensIndexByKey: Record<string, number> = { a: 0, s: 1, d: 2, f: 3 };
      const type = typeByKey[e.key];
      if (type) {
        e.preventDefault();
        setWorkingType(type);
        return;
      }
      const lensIndex = lensIndexByKey[e.key.toLowerCase()];
      if (lensIndex !== undefined) {
        e.preventDefault();
        selectLensByIndex(lensIndex);
        return;
      }
    }

    if (e.key !== "Enter") return;

    e.preventDefault();
    if (step === "classify" && chosenLensId && working) {
      if (working.type === "delete") {
        void dispatch();
      } else if (working.type === "list-item") {
        // Same gate as the Continue button — a list-item dispatch needs a
        // chosen Simple-list Project before it can commit.
        if (canComplete) void dispatch();
      } else {
        step = "spec";
      }
    } else if (step === "spec" && canComplete) {
      void dispatch();
    }
  }

  function setWorkingType(type: ChosenType): void {
    if (type === "project" && hasProjectDestination && !isListDestination) return;
    setW({ type });
  }

  // Effective project = manual picker choice > resolved #token link.
  const effectiveProjectId = $derived(working?.projectId ?? resolvedProjectId ?? null);
  const projectName = $derived(
    structuredProjects.find((p) => p.id === effectiveProjectId)?.name ?? null,
  );
  const projectGoalName = $derived(
    goals.find((g) => g.id === working?.projectGoalId)?.name ?? null,
  );
  const parentName = $derived(
    working?.parentProjectId
      ? structuredProjects.find((p) => p.id === working?.parentProjectId)?.name ?? null
      : null,
  );

  const selectedList = $derived(listProjects.find((p) => p.id === listProjectId) ?? null);

  function onBodyChange(value: string): void {
    setW({ title: value });
    if (step !== "spec") scheduleTextSave(item!.id, value);
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="aa-triage">
  {#if isComplete}
    <div class="aa-triage-empty">
      <div class="aa-empty-mark" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <h2 class="aa-triage-empty__title">Inbox zero.</h2>
      <p class="aa-triage-empty__text">Nothing left to decide. Go do something.</p>
      <div class="aa-triage-empty__actions">
        <a href="/do" class="aa-btn aa-btn--primary">Done →</a>
        <a href="/do/inbox" class="aa-btn aa-btn--secondary">Back to inbox</a>
      </div>
    </div>
  {:else}
    <!-- Top: close + progress -->
    <div class="aa-triage__top">
      <a
        href="/do/inbox"
        class="aa-triage__close"
        title="Done triaging (Esc)"
        aria-label="Close"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </a>
      <div class="aa-triage__progress">
        <span class="aa-triage__progress-count"><b>{idx + 1}</b> of <b>{total}</b></span>
        <div class="aa-triage__progress-bar">
          <div
            class="aa-triage__progress-fill"
            style="width: {total > 0 ? (idx / total) * 100 : 0}%"
          ></div>
        </div>
      </div>
      <span class="aa-triage__top-spacer"></span>
    </div>

    <div class="aa-triage__title">
      <h1>Triage</h1>
      <p>Define each thing. It leaves the inbox for good once it's specified.</p>
    </div>

    {#if error}
      <div class="aa-triage__error"><span>{error}</span></div>
    {/if}

    <div class="aa-triage__stage">
      {#if item && working}
        {#key item.id}
        <TriageCard
          body={working.title}
          onBodyChange={
            editingBody || working.type === "list-item"
              ? (value) => onBodyChange(value)
              : undefined
          }
          onBodyBlur={
            editingBody && working.type !== "list-item" ? () => (editingBody = false) : undefined
          }
          onBodyEdit={working.type !== "list-item" ? () => (editingBody = true) : undefined}
          autoFocusBody={editingBody}
          bodyLabel={step === "spec" ? "Title" : "Captured text"}
          meta={`captured ${formatAgo(item.createdAt)}`}
          chips={working.type === "list-item" ? [] : triageChips}
          {exit}
          {dispatched}
          {entering}
        >
          {#if step === "classify"}
            <!-- ============ STEP 1: Classify ============ -->
            <div class="aa-triage-step">
              <div class="aa-triage-step__label">1 · Classify</div>
              {#if working.type === "list-item"}
                <label class="aa-triage-list-picker">
                  <span class="aa-triage-list-picker__label">Add to list</span>
                  <select
                    value={listProjectId ?? ""}
                    onchange={(e) => (listProjectId = e.currentTarget.value)}
                  >
                    <option value="" disabled>Choose a list…</option>
                    {#each listProjects as p (p.id)}
                      <option value={p.id}>
                        {p.name}{p.lensName ? ` · ${p.lensName}` : ""}
                      </option>
                    {/each}
                  </select>
                </label>
                {#if listProjects.length === 0}
                  <p class="aa-triage-step__hint">
                    No lists yet — create one from the Projects page.
                  </p>
                {/if}
                {#if isListDestination && lensInferenceLabel}
                  <p class="aa-triage-step__hint" aria-live="polite">
                    {lensInferenceLabel} — matched a list in your capture, so this is
                    preselected. Pick another type above to file it as structured
                    work instead.
                  </p>
                {/if}
              {:else if hasProjectDestination && !isListDestination}
                <div class="aa-triage-destination">
                  <span class="aa-triage-destination__label">Destination</span>
                  <span class="aa-triage-destination__value">
                    {projectBridge?.projectName} · {projectDestinationLens?.name}
                  </span>
                </div>
              {:else}
                {#if lensInferenceLabel && inferredLens}
                  <p class="aa-triage-step__hint" aria-live="polite">{lensInferenceLabel}</p>
                {/if}
                <div class="aa-triage-lens-pills" role="radiogroup" aria-label="Lens">
                  {#each classifyLensOptions as l (l.id)}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={chosenLensId === l.id}
                      data-lens-color={l.color ?? undefined}
                      class="aa-triage-lens-pill {chosenLensId === l.id ? "active" : ""}"
                      onclick={() => {
                        lensTouched = true;
                        chosenLensId = l.id;
                      }}
                    >
                      <span class="aa-triage-lens-pill__dot" aria-hidden="true"></span>
                      {l.name}
                    </button>
                  {/each}
                </div>
              {/if}
              <div class="aa-triage-types">
                {#each classifyTypes as row (row.t)}
                  {@const { t, label, sub, icon } = row}
                  <button
                    type="button"
                    class="aa-triage-type {working.type === t ? "active" : ""}"
                    onclick={() => setWorkingType(t)}
                  >
                    <Icon name={icon} size={16} />
                    <span class="aa-triage-type__label">{label}</span>
                    <span class="aa-triage-type__sub">{sub}</span>
                  </button>
                {/each}
              </div>
              {#if working.type === "list-item"}
                <p class="aa-triage-list-note">
                  No dates, priority, projects, or other setup.{selectedList
                    ? ` This becomes one item in ${selectedList.name}.`
                    : ""}
                </p>
              {/if}
              <button
                type="button"
                class="aa-btn aa-btn--primary aa-triage-step__continue"
                onclick={() => {
                  if (!working) return;
                  if (working.type === "delete" || working.type === "list-item") void dispatch();
                  else step = "spec";
                }}
                disabled={
                  working.type === "delete"
                    ? !working.title.trim()
                    : working.type === "list-item"
                      ? !listProjectId || !working.title.trim()
                      : !chosenLensId || !working.title.trim()
                }
              >
                {working.type === "delete"
                  ? "Delete"
                  : working.type === "list-item"
                    ? `Add to ${selectedList?.name ?? "list"}`
                    : "Continue"}
              </button>
            </div>
          {:else}
            <!-- ============ STEP 2: Spec ============ -->
            <div class="aa-triage-step">
              <div class="aa-triage-step__label">
                2 ·
                {working.type === "task"
                  ? "Specify the task"
                  : working.type === "project"
                    ? "Specify the project"
                    : "File the resource"}
              </div>
              <div class="aa-triage-spec">
                {#if working.type === "task"}
                  <PropertyChips
                    fields={taskFields({
                      working,
                      structuredProjects,
                      goals,
                      projectName,
                      projectGoalName,
                      parentName,
                      projectIsDefault: !projectName,
                    })}
                    onPick={(key, value) => setW(chipPickToWorkingPatch(key, value))}
                    onPickerPick={(key, value) => {
                      if (key === "project" && value) setW({ projectId: value });
                      else if (key === "goal" && value) setW({ projectGoalId: value });
                      else if (key === "parent" && value) setW({ parentProjectId: value });
                    }}
                    onOpenChange={(open) => (chipOpen = open)}
                  />
                  <label class="aa-triage-notes">
                    <span class="aa-triage-notes__label">Context</span>
                    <textarea
                      class="aa-triage-notes__textarea"
                      aria-label="Task context"
                      value={working.content}
                      oninput={(e) => setW({ content: e.currentTarget.value })}
                      rows={4}
                      placeholder="Add details, links, or next steps."
                    ></textarea>
                  </label>
                {:else if working.type === "project"}
                  <PropertyChips
                    fields={projectFields({
                      working,
                      structuredProjects,
                      goals,
                      projectName,
                      projectGoalName,
                      parentName,
                      projectIsDefault: !projectName,
                    })}
                    onPick={(key, value) => setW(chipPickToWorkingPatch(key, value))}
                    onPickerPick={(key, value) => {
                      if (key === "project" && value) setW({ projectId: value });
                      else if (key === "goal" && value) setW({ projectGoalId: value });
                      else if (key === "parent" && value) setW({ parentProjectId: value });
                    }}
                    onOpenChange={(open) => (chipOpen = open)}
                  />
                {:else}
                  <PropertyChips
                    fields={resourceFields({
                      working,
                      structuredProjects,
                      goals,
                      projectName,
                      projectGoalName,
                      parentName,
                      projectIsDefault: !projectName,
                    })}
                    onPick={(key, value) => setW(chipPickToWorkingPatch(key, value))}
                    onPickerPick={(key, value) => {
                      if (key === "project" && value) setW({ projectId: value });
                      else if (key === "goal" && value) setW({ projectGoalId: value });
                      else if (key === "parent" && value) setW({ parentProjectId: value });
                    }}
                    onOpenChange={(open) => (chipOpen = open)}
                  />
                {/if}
              </div>
              <div class="aa-triage-confirm">
                <div class="aa-triage-confirm__summary">
                  {summaryFor(working, projectName ?? "General", projectGoalName, parentName)}
                  {#if working.type === "task" && working.priority === "NORMAL"}
                    <!-- {formatPriority(working.priority)} surfaces in the summary line -->
                  {/if}
                </div>
                <button
                  type="button"
                  class="aa-btn aa-btn--ghost"
                  onclick={() => (step = "classify")}>Back</button
                >
                <button
                  type="button"
                  class="aa-btn aa-btn--primary"
                  disabled={!canComplete}
                  onclick={() => void dispatch()}>Ready</button
                >
              </div>
            </div>
          {/if}
        </TriageCard>
        {/key}
      {/if}
    </div>
  {/if}
</div>
