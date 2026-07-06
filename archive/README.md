# Archive

Historical artifacts kept for reference but **not part of the live docs tree**.
Nothing in `docs/` or `webapp/src/` references anything here. These are frozen
explorations, rejected approaches, or version snapshots — read for context on
*why* something landed the way it did, but they are not authoritative.

## Contents

### `mockups/` (frozen 2026-07-05)

27 mockups moved out of `docs/mockups/` during the docs-balance cleanup. They
fall into three groups:

- **Rejected approaches** — `triage-tinder.html`, `triage-a-vs-c.html`,
  `interaction-approaches.html`, `app-shell-whatnow.html` (v1 + final),
  `mode-zoom-unified.v3.html`. Spec decisions went a different way; these
  captured the alternative that lost.
- **Focus redesign variants A–E** (`focus-a-calm-presence.html` through
  `focus-e-hidden-sprint.html` + the A–F PNG screenshots). The redesign locked
  to **Variant F** (`focus-f-final.html` lives on in `docs/mockups/`); the
  rejected variants are kept here for the decision record.
- **Color/system explorations** — `accent-candidates.html`,
  `teal-amber-system.html`. The system shipped to `webapp/src/styles/tokens.css`
  and `docs/DESIGN-SYSTEM.md`; these were the intermediate states.
- **Mobile gestures that never shipped** — `mobile-gesture-modal.html`. The
  webapp has no mobile gesture modal; kept as the historic mobile exploration.
- **UI scaffolding iterations** — `project-page-redesign/`, `task-page-edit/`
  directories. Both pages shipped with different layouts than these drafts.

If you need to understand *why* a current surface looks nothing like one of
these, the answer is usually in `docs/HISTORY.md` or the relevant spec.
