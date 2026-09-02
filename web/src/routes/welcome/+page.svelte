<!--
  OnboardingPage — S13 port of webapp/src/onboarding/OnboardingPage.tsx (the
  parity checklist is packages/contract/src/s13-onboarding/README.md §3.1;
  same look — the CSS is the webapp file verbatim).

  One-time carousel: welcome → (name, only when !firstName) → capture →
  triage → focus. Three one-sentence teaching panels for the real loop with
  minimal decorative visuals (aria-hidden), dots, mobile title variants,
  focus moved to each guided heading for a11y.

  Load-bearing rules (P0 §5 — lose either and finishing bounces the user
  back to /welcome in a redirect loop):
  - `finish` navigates ONLY when the server acknowledged completion, after
    the store's optimistic status patch (the ["auth/me"] patch analogue).
  - `Esc` anywhere except while typing = skip → COMPLETE (no sample task).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { onboarding } from "../../lib/stores/onboarding.svelte";
  import "../../lib/styles/onboarding.css";

  type Page = "welcome" | "name" | "capture" | "triage" | "focus";

  // The real loop, in three one-sentence panels. Each pairs a single line
  // with a minimal visual — no coachmarks, no tutorial-on-the-tutorial.
  const STEPS: {
    page: Extract<Page, "capture" | "triage" | "focus">;
    eyebrow: string;
    title: string;
    mobileTitle?: string;
    body: string;
  }[] = [
    {
      page: "capture",
      eyebrow: "1 of 3 · capture",
      title: "Use ⌘K to capture a thought.",
      mobileTitle: "Capture a thought before it disappears.",
      body: "Capture is for thoughts before they become plans. Anything landing in your head goes in the Inbox first.",
    },
    {
      page: "triage",
      eyebrow: "2 of 3 · triage",
      title: "Decide what each thing becomes.",
      body: "Some thoughts are tasks. Some need a project. Some can wait. Triage is where you decide without cluttering today.",
    },
    {
      page: "focus",
      eyebrow: "3 of 3 · focus",
      title: "Start with one thing.",
      body: "We’ll put one practice task on your table. Complete it, then try the real loop with one thought of your own.",
    },
  ];

  let pageIdx = $state(0);
  let leaving = $state(false);
  let nameValue = $state("");
  let headingEl: HTMLHeadingElement | null = $state(null);

  const firstName = $derived(onboarding.status?.firstName ?? "");
  // The name step appears only when the account has no first name
  // (e.g. Google-derived or signup fullName would have set it).
  const pages = $derived<Page[]>(
    firstName.trim()
      ? ["welcome", "capture", "triage", "focus"]
      : ["welcome", "name", "capture", "triage", "focus"],
  );
  const currentPage = $derived(pages[pageIdx] ?? "welcome");
  const stepIdx = $derived(STEPS.findIndex((s) => s.page === currentPage));
  const currentStep = $derived(stepIdx >= 0 ? STEPS[stepIdx] : null);

  // Carousel content replaces in place. Move focus to guided-step headings so
  // keyboard and screen-reader users receive the new instruction. The welcome
  // screen stays unfocused: autofocus there creates a distracting outline.
  $effect(() => {
    if (currentPage === "welcome" || currentPage === "name") return;
    // Wait for the new heading to mount, then focus it.
    requestAnimationFrame(() => headingEl?.focus());
  });

  async function finish(skipGuidance = false) {
    const ok = await onboarding.complete(skipGuidance);
    if (!ok) return; // stay on the panel; the error renders; retry allowed
    leaving = true;
    goto("/");
  }

  function next() {
    if (pageIdx >= pages.length - 1) {
      void finish();
    } else {
      pageIdx += 1;
    }
  }

  function submitName() {
    void onboarding.setPreferredName(nameValue, firstName);
    next();
  }

  // Keyboard nav applies to reading panels, never to editable controls. The
  // name step owns Enter; arrow keys must retain their native text behavior.
  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (
      currentPage === "name" ||
      target?.matches("input, textarea, select, [contenteditable='true']")
    ) {
      return;
    }
    if (pageIdx === 0) return;
    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" && pageIdx > 0) {
      e.preventDefault();
      pageIdx -= 1;
    } else if (e.key === "Escape") {
      void finish(true);
    }
  }

  onMount(() => {
    void onboarding.load();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="aa-onboarding" class:leaving>
  <div class="aa-ob-bg"></div>

  <div class="aa-ob-stage">
    {#if currentPage === "welcome"}
      <div class="aa-ob-page aa-ob-enter">
        <div class="aa-ob-eyebrow">Welcome to ActionAmp</div>
        <h1 bind:this={headingEl} tabindex="-1" class="aa-ob-h1 aa-ob-h1--wide">
          It opens to one task, not a list.
        </h1>
        <p class="aa-ob-body aa-ob-body--intro">
          Accomplish your goals, one task at a time.
        </p>
        <button class="aa-ob-cta aa-ob-cta--inline" onclick={next}>
          Show me →
        </button>
        <button
          class="aa-ob-skip"
          onclick={() => void finish(true)}
          disabled={onboarding.completing}
        >
          Skip intro
        </button>
      </div>
    {:else if currentPage === "name"}
      <div class="aa-ob-page aa-ob-enter">
        <div class="aa-ob-eyebrow">First, a quick hello</div>
        <h1 bind:this={headingEl} tabindex="-1" class="aa-ob-h1">
          What should we call you?
        </h1>
        <p class="aa-ob-body">
          First name, nickname, whatever feels right. You can change it later in
          Settings.
        </p>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="aa-ob-name-input"
          type="text"
          aria-label="Your name"
          bind:value={nameValue}
          placeholder={firstName || "Your name"}
          autofocus
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitName();
            }
          }}
        />
        <button
          class="aa-ob-cta aa-ob-cta--inline"
          disabled={onboarding.completing}
          onclick={submitName}
        >
          Looks good →
        </button>
      </div>
    {:else if currentStep}
      <!-- keyed so the enter animation replays on each step (webapp key=stepIdx) -->
      {#key stepIdx}
        <div class="aa-ob-page aa-ob-enter">
        <div class="aa-ob-eyebrow">{currentStep.eyebrow}</div>
        <h2 bind:this={headingEl} tabindex="-1" class="aa-ob-h2">
          {#if currentStep.mobileTitle}
            <span class="aa-ob-title-desktop">{currentStep.title}</span>
            <span class="aa-ob-title-mobile">{currentStep.mobileTitle}</span>
          {:else}
            {currentStep.title}
          {/if}
        </h2>
        <p class="aa-ob-body">{currentStep.body}</p>

        <!-- Minimal loop visuals — calm, one shape each; decorative, so the
             whole visual is hidden from screen readers (webapp parity). -->
        {#if currentStep.page === "capture"}
          <div class="aa-ob-loop-visual aa-ob-loop-capture" aria-hidden="true">
            <span class="aa-ob-kbd aa-ob-kbd--desktop">⌘K</span>
            <span class="aa-ob-mobile-capture-chip">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <span class="aa-ob-capture-line">a thought…</span>
          </div>
        {:else if currentStep.page === "triage"}
          <div class="aa-ob-loop-visual aa-ob-loop-triage" aria-hidden="true">
            <div class="aa-ob-triage-row">
              <span class="aa-ob-triage-text">Call Sam</span>
              <span class="aa-ob-triage-key">Task</span>
            </div>
            <div class="aa-ob-triage-row">
              <span class="aa-ob-triage-text">Plan Q3</span>
              <span class="aa-ob-triage-key">Project</span>
            </div>
          </div>
        {:else}
          <div class="aa-ob-loop-visual aa-ob-loop-focus" aria-hidden="true">
            <div class="aa-ob-focus-card">
              <div class="aa-ob-focus-check">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <span class="aa-ob-focus-text">Email Sarah</span>
            </div>
          </div>
        {/if}

        <div class="aa-ob-dots" aria-hidden="true">
          {#each STEPS as _, i (i)}
            <span class="aa-ob-dot" class:active={i === stepIdx}></span>
          {/each}
        </div>

        <div class="aa-ob-actions">
          {#if onboarding.completionError}
            <p class="aa-ob-error" role="alert">
              Couldn’t save — check your connection and try again.
            </p>
          {/if}
          <button
            class="aa-ob-cta"
            onclick={next}
            disabled={onboarding.completing}
          >
            {onboarding.completing
              ? "Saving…"
              : stepIdx >= STEPS.length - 1
                ? "Try the practice task →"
                : "Next →"}
          </button>
        </div>
        </div>
      {/key}
    {/if}
  </div>
</div>
