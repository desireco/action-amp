---
id: capture-grammar
kind: spec
title: "Capture grammar v2 (#projects+tags, @time, [[lens]], resolver, inline autocomplete)"
status: shipped
priority: P2
feature: capture-grammar
spec_owner: discover
build_owner: build
created: 2026-07-04
---

# Spec: Capture grammar v2

> **Update 2026-07-04 (build):** the "`#` is tags-only" decision was reversed
> after a usability pass. `#` is back to being the **project sigil** (first
> `#token` / `#[Project Name]` = project hint, extras = tags), matching the original shipped
> behavior — but now with **inline caret-anchored autocomplete** showing
> project names. The picker-row typeahead was removed; text is
> the single source of truth again. The `@`-time-only and `[[lens]]` decisions
> survive. Sections below describe the original v2 framing and are left for
> history; the build reflects the reversal.

## Summary

Capture keeps `#` as the project-first sigil while cleaning up the rest of the
grammar: first `#` mention = project hint, later `#` mentions = tags; `@` is
time only; `!`/`~` are urgency/size; `[[lens]]` is the explicit cross-lens
override. Project intent can also be inferred from free text by a resolver,
with the project's lens as the bridge between capture and lens. The triage
Context step still **confirms every lens assignment** as a visible chip —
`[[ ]]` and inference **pre-fill, they never silently file** — so WORKFLOW.md
§5.5's "explicit ratification" reversal stays intact.


## Why

Two gaps surfaced in the shipped capture flow:

1. **`parsedProject` is dead weight.** The parser stores a `#project` hint on
   `InboxItem`, but `triageInboxItem` never resolves it to a real project
   server-side (`inbox/operations.ts:124-131` falls straight to "General"
   regardless of the hint). The hint is resolved only client-side in
   `TriagePage.tsx:185-190`, and only if the user happens to be in the right
   lens. A typo, or a capture from the wrong lens, silently lands the task in
   General. The token exists but goes nowhere.
2. **The grammar overloads `@` and `#`.** `@` does two unrelated jobs today
   (context tags + dates); `#` does two as well (project + extra tags). The
   `#`/`@` distinction was locked 2026-06-22 (TRIAGE.md §7.5) on the premise
   that "`#` links a project, `@` is a context tag" — but that split is
   arbitrary, and it leaves no headroom for the lens concept at capture time.

The broader thesis this unblocks: **smart triage as a copy editor.** Today
triage is a form that mostly restates what the system already knows. The
resolver is the foundation that lets it pre-fill confidently and show the guess
visibly — without ever silently auto-filing (which is what §5.5 reversed last
time). Per the audience (ADHD muse), wrong silent guesses cost more than the
step they save; visible + overridable is what makes inference safe.

## The grammar (locked)

| Sigil | Means | Examples | Notes |
|---|---|---|---|
| `#` | project first, then tags | `#mvp`, `#[Q3 Launch]`, `#mvp #deep-work` | First `#` mention is `parsedProject`; later `#` mentions are `parsedTags`. |
| `@` | date | `@today @tomorrow @tonight` | Time only. Bare `today`/`tomorrow`/`tonight` + weekday/month forms still work. Was: tags + time. |
| `!` | priority | `!1 !low !!!` | Unchanged |
| `~` | size | `~20m ~1h ~XL` | Unchanged |
| `[[name]]` | lens override | `[[work]] [[personal]] [[studio]]` | **New.** Explicit cross-lens path. Unknown → literal text. |
| *(free text)* | inferred project hint | "email Sarah about MVP" | Resolver matches project names in the active/inferred lens when no explicit `#` project exists. |

The first `#` mention is the explicit project path. Project intent can also be
matched from cleaned free text by the resolver against the active lens's
projects (or the `[[ ]]`-overridden lens's projects). `[[ ]]` is the only
explicit cross-lens path; it pre-fills the Context step but does not skip it.

## `[[ ]]` resolution rules

1. **Seeded lenses resolve on `kind`**, not name. `[[work]]` → `kind=WORK`,
   `[[personal]]`/`[[me]]` → `kind=PERSONAL`. Renaming "Work" → "Studio" does
   not break the token — same rename-safety property as
   `assertLensAllowed` (see `custom-lenses.md` §"Stable handle").
2. **Custom lenses resolve on exact case-insensitive name.** `[[studio]]` →
   the user's lens named "Studio". Custom lenses are user-defined; users own
   rename breakage for the names they invented.
3. **Unknown tokens stay literal.** `[[xyzzy]]` matches nothing → treated as
   literal text, no lens inferred, no extraction. This kills false positives on
   pasted notes that happen to use wiki-link syntax (Obsidian/Notion/Roam).
4. **First match wins; one lens per capture.** A second `[[ ]]` token in the
   same capture is preserved as literal text (lossless, like extra `#` today).

## Project resolver (v1 bar)

The resolver runs at triage, against the lens the Context step is about to
commit to (the `[[ ]]`-inferred lens, else the active lens):

- **Exact case-insensitive whitespace/sentence-boundary match** against the
  project names in that lens. `"email about MVP"` matches a project literally
  named "MVP"; `"email about MVP2"` does not. Punctuation inside project names
  is allowed (`C++`, `Q4/OKR`).
- **If multiple match**, pick the **longest** (most specific). `"Q3 launch"`
  beats `"Q3"` if both exist.
- **No fuzzy, no substring, no acronym matching.** v1 only. Non-goals below.
- **Cross-lens disagreement → project hint does not match.** If `[[personal]]`
  is set and a project name in the text matches a *Work* project (different
  lens), the hint is **not** a match — it falls to General in the Personal lens
  (or stays unresolved). **`[[ ]]` wins** (explicit beats inference).

This replaces the dead `parsedProject` resolution path: the project is found
from free text, not from a sigil, and it's resolved in the right lens.

## Capture-time project typeahead

The resolver surfaces a project match one step later, at triage. **Typeahead
brings discovery forward to capture** — closes the original "I can't see my
projects when I'm typing" gap, and lets a confident pick at capture skip the
triage guess entirely. The resolver and typeahead are complements, not
alternatives: typeahead is the explicit path (user picks), resolver is the
inferred path (system guesses).

**UI shape — inline `#` mention dropdown:** Typing `#` opens a caret-anchored
popover of projects. The query is the text after `#`; choosing a project inserts
`#name` for single-token names or `#[Project Name]` for names with spaces. The
parser writes that first mention to `parsedProject` and the live preview renders
the same `▣ name` chip as a manually typed project hint.

- **Scope:** all of the user's open projects are visible. If a project lives in
  another lens, the row shows that lens name; triage then pre-fills Context from
  the chosen project's lens and still requires confirmation.
- **Keyboard:** arrow keys move through matches; `Enter`/`Tab` accepts the
  active match; `Esc` closes the dropdown and returns to normal capture typing.
- **Search:** prefix match (case-insensitive) on project name. No fuzzy matching
  or acronym matching.
- **Compose with resolver:** explicit `#` project mention wins over the free-text
  resolver. If the user didn't type or accept a `#` project, the resolver runs as
  specified in §"Project resolver (v1 bar)".
- **No new field, no schema change.** Typeahead writes through the existing
  `parsedProject` storage path.

## Confirmation model (WORKFLOW.md §5.5 preserved)

`[[ ]]` and project-inferred lens both **pre-fill** the Context step:

- The Context radio opens with the inferred lens selected.
- A visible chip explains the inference ("from `[[work]]`", "from project
  MVP") so the user can see *why* it guessed.
- The user still hits **Continue** to ratify. No silent filing.

This is the load-bearing safety property. WORKFLOW.md §5.5 was *reversed* on
2026-06-25 precisely to kill silent auto-filing — the active-lens inherit
behavior got reverted because "triage is a deliberate specification flow, not
a speed dispatch." This spec keeps that reversal intact: smarts pre-fill the
choice, the user ratifies it. The common case is still one Continue.

## Done-conditions

**Parser (`webapp/src/inbox/parseCapture.ts`)**
- [ ] `parseCapture("#mvp call Sarah")` → `{ parsedProject: "mvp", parsedTags: [] }`
      (first `#` mention is the project hint)
- [ ] `parseCapture("call Sarah #[Q3 Launch]")` → `{ parsedProject: "q3 launch", parsedTags: [] }`
      (bracketed form supports autocomplete picks with spaces)
- [ ] `parseCapture("x #mvp #errands")` → `{ parsedProject: "mvp", parsedTags: ["#errands"] }`
      (extra `#` mentions are tags)
- [ ] `parseCapture("email @phone")` → `parsedTags: []`, cleanText `"email @phone"`
      (`@` is time-only; `@phone` is not a recognized time → preserved as literal text, not a tag)
- [ ] `parseCapture("call [[work]] about MVP")` → `{ parsedLens: "work", cleanText: "call about MVP" }`
- [ ] `parseCapture("[[personal]] errand")` and `[[me]] errand` →
      `parsedLens: "personal"` / `"me"` (both forms accepted for the PERSONAL kind)
- [ ] `parseCapture("[[xyzzy]] thing")` → `parsedLens: null`, cleanText `"[[xyzzy]] thing"`
      (unknown → literal, no extraction)
- [ ] `@today`/`@tomorrow`/`@tonight` still set `parsedDate` and are stripped
      from cleanText (regression — these were already special-cased)
- [ ] Bare `today`/`tomorrow`/`tonight` + weekday/month forms unchanged (full
      existing `parseCapture.test.ts` regression suite passes minus the removed
      `#project` and `@tag` cases, which are rewritten)

**Schema**
- [ ] `InboxItem.parsedLens String?` field added (nullable; lens token from `[[ ]]`,
      null when absent or unknown)
- [ ] `wasp db migrate-dev --name inbox_parsed_lens` runs clean
- [ ] `wasp compile` passes

**Server (`webapp/src/inbox/operations.ts`)**
- [ ] `createInboxItem` persists `parsedLens` alongside the other parsed-* fields
- [ ] `getInboxItems` selects `parsedLens` so the client can resolve it
- [ ] `triageInboxItem` carries `parsedLens` resolution through to the Context
      step (resolution itself stays client-side, mirroring today's
      `parsedProject` pattern at `TriagePage.tsx:185-190`)

**Resolver + triage (`webapp/src/inbox/TriagePage.tsx`)**
- [ ] `parsedLens` resolves to a real lens at triage: `kind` match for seeded,
      exact name for custom. Pre-fills Context step with the resolved lens
      selected and a "from `[[ ]]`" chip.
- [ ] `[[ ]]`-inferred lens overrides the active-lens default in the Context
      step pre-fill.
- [x] Project resolver matches the cleaned text against the inferred lens's
      projects; pre-fills the Project row on exact whitespace/sentence-boundary match
      (longest match wins on ties).
- [ ] When `[[ ]]` lens and project-inferred lens disagree, the project hint
      does not match; `[[ ]]` wins; project row stays General/unresolved.
- [ ] Context step still requires Continue (no silent filing — §5.5 intact).

**UI (`webapp/src/components/ui/CapturePopover.tsx`)**
- [ ] Live preview shows a lens chip when `[[ ]]` is parsed.
- [ ] Placeholder text reflects the current grammar: first `#` mention is a
      project, `@` time tokens are dates, and `[[lens]]` is supported.
- [ ] Captured-stack chips render the lens token alongside the others.
- [ ] **Inline project autocomplete** opens on `#`, anchored at the caret.
      Prefix match only; arrow keys move; `Enter`/`Tab` accepts; `Esc` closes.
- [ ] Selecting a project inserts `#name` or `#[Project Name]`; the parser writes
      `parsedProject` and renders the `▣ name` chip in the live preview.
- [ ] When the picker writes a project, the triage resolver **does not re-guess**
      — the explicit pick wins silently (no "from project X" chip).
- [ ] `AppShell.tsx` passes the active lens (or its projects) to `CapturePopover`
      so the picker has its source list without a new query.

## Non-goals

- **No fuzzy / substring / acronym project matching.** v1 is exact
  whitespace/sentence-boundary only. Revisit when v1 ships and we see real miss
  patterns.
- **No resolver confidence scoring** or "did you mean" disambiguation UI.
- **No task-shaping hints** (vagueness detection, "this looks too big",
  split-this suggestions). That's a later phase that sits on top of a trusted
  resolver — the resolver is the foundation, not the whole feature.
- **No migration of existing captures.** Clean break. Existing InboxItems keep
  their stored `parsedTags`/`parsedProject` strings; the parser doesn't re-run
  on stored items, so old `@phone` tags on unprocessed items still flow through
  triage as before. Only *new* captures use the new grammar. Pre-revenue, no
  coordinated surface area.
- **No lens inference from free text without `[[ ]]`.** Only project-bridged
  inference (a matched project carries its lens); explicit `[[ ]]` is required
  for any other cross-lens intent.
- **No fuzzy / substring / acronym autocomplete.** The inline project list uses
  prefix matching only.

## Open questions

_(none)_ — grammar split, `[[ ]]` resolution, resolver v1 bar, `[[ ]]`
precedence over project-inferred lens, inline `#` project autocomplete
(prefix-match, `Enter`/`Tab` accepts, explicit pick wins over resolver), and §5.5
preservation are all locked. Fuzzy matching and task-shaping are explicitly
non-goals pending v1 evidence.

## Doc cascade

Per AGENTS.md's "structure changes start in WORKFLOW.md" rule, these doc edits
ship *with* the build, not after:

1. **`docs/WORKFLOW.md`** — §2.1 update capture description to the new grammar;
   §5 new "Decisions locked" entry #9 (grammar v2 + `[[lens]]` + resolver-driven
   projects + `[[ ]]` precedence); §6 append the downstream docs below.
2. **`docs/TRIAGE.md`** — §4 step 1 note that Context pre-fills from
   `parsedLens`; §5 line 180 rewrite the `#`/`@` one-liner; §7.5 lines 314 +
   317-320 supersede the 2026-06-22 sigil decision.
3. **`docs/DATA-MODEL.md`** — §2 add `parsedLens` to the InboxItem parsed-
   metadata description; dated v5 (2026-07-04) note.
4. **`docs/features/capture.md`** — rewrite the grammar block (lines 16-22) to
   the new table.
5. **`docs/features/inbox-triage.md`** — add a Resolver line describing the
   project + lens pre-fill behavior.
6. **`docs/FEATURES.md`** F2 — update the example (self-flagged stale, low-
   stakes, but the grammar example is now wrong without this).
7. **`docs/ROADMAP.md`** — add `capture-grammar` to the `### Then` tier.
8. **`webapp/src/inbox/parseCapture.ts`** — code comments at lines 14 and 115
   cite TRIAGE.md §7.5; update them to point at the superseding decision.

## Prototypes

_(none — defer to Build. The resolver is well-scoped enough to implement
directly; if Build wants a throwaway worktree to tune the boundary matcher
against real project names, that's the right place for one.)_
