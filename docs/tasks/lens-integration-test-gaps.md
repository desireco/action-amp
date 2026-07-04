---
kind: task
status: draft
priority: medium
feature: custom-lenses
parent: reviews/custom-lenses.md
---

# Custom-lenses: integration test gaps

Spawned from the custom-lenses review (validation reviewer). The server + pure-
logic layers are well-covered, but several spec done-conditions are only proven
at the leaf, not at the integration layer where the bug would actually manifest.
These are the gaps worth closing — ranked by load-bearingness.

## Gaps

1. **FREE user → `<ProGate>` on the Lenses tab (UNTESTED).** No
   `LensesPage.test.tsx` exists. This is the headline entitlement surface and
   the spec calls it out twice. Mount LensesPage with `entitled=false`, assert
   ProGate renders, assert no list/edits.

2. **The active-lens migration React effect (UNTESTED).**
   `activeLensMigration.test.ts` tests localStorage in isolation (and is mildly
   tautological — it re-implements the sentinel logic inline). The actual
   resolution effect in `AppShell.tsx` (sentinel → real id → repersist → delete
   old key) has zero coverage. Either test the effect via a component test, or
   extract the resolution into a pure helper and test that.

3. **`assertLensAllowed` rename-safety, composed (PARTIAL).** The pure
   `lensViolation` is tested with a hand-rolled `{name:"Studio", kind:"WORK"}`
   input, but nothing composes `resolveLens` + `assertLensAllowed` + a mocked
   `Lens.findFirst` returning a renamed row. A refactor breaking the wiring
   (dropping `kind` from the select, passing `lens.name` instead of `lens`)
   would pass CI.

4. **Create-at-cap → 402 (PARTIAL).** `operations.test.ts` asserts
   `assertUnderCap` is called with `PRO_LIMITS.lenses`, but never puts `count`
   at the cap and asserts rejection. Add a test: `Lens.count` = 8 → createLens
   rejects.

5. **`<html data-lens>` mirror on switch (UNTESTED).** `AppShell.tsx` effect
   that sets `document.documentElement.dataset.lens`. Spec switcher done-condition.

6. **Popover `esc` + `⌘L` keys (UNTESTED).** Half the keyboard contract the spec
   enumerates. `esc` is delegated to the parent's `onCloseOverlay`; `⌘L` is in
   `useKeyboardShortcuts`.

7. **No status code (402/409/400/404) is ever asserted** — only message regexes
   (accepted limitation: the real `HttpError` is in `wasp/server`, stubbed).
   Consider an e2e or a thin integration test that asserts the HTTP status.

## Done-conditions

- [ ] `LensesPage.test.tsx` covers FREE → ProGate + Pro list render.
- [ ] The migration resolution effect (or an extracted pure helper) is tested.
- [ ] `assertLensAllowed` is tested end-to-end with a mocked renamed lens.
- [ ] create-at-cap test asserts rejection at `count = PRO_LIMITS.lenses`.
- [ ] `data-lens` mirror + `esc`/`⌘L` covered.
