---
slug: triage-classify-step
title: "Triage Classify step"
feature_area: triage
status: shipped
spec: triage-classify-step.md
verified: 2026-07-05
---

# Triage Classify step

**Shipped (core) 2026-07-04–05.** Replaces Triage's separate **Context** and
**Type** wizard steps with one keyboard-optimized **Classify** step. Classify
lets the user confirm or change both decisions at once: what the inbox item
becomes, and where it will land.

**Today.** Triage flow is **Classify → Spec → Ready**:
- **Classify** — Type + Destination together. Type chooser renders as one-line
  rows with a leading icon; Lens renders as large styled pills; goal meta and
  lens pill appear on all pickers. When capture or free text resolves to a
  concrete Project, that Project is a strong destination signal — Triage uses
  the Project's Lens and skips the standalone lens selection by default, while
  `[[lens]]` still preselects a visible, reversible Lens choice.
- **Spec** — Type-specific property rows (priority, size, due, project, goal,
  tags) via the shared `PropertyChips` editor; property-key shortcuts active.
  Back button returns to Classify.
- **Ready** — Commit the prepared entity and advance.

**Remaining polish** (not blocking): full `/` Lens picker from Spec, and
cross-lens Project change from Spec. Spec at `docs/specs/done/triage-classify-step.md`.

**Why it matters.** Before Classify, every triaged item landed on a standalone
Context step even when the destination was obvious from the active lens, an
explicit `[[lens]]` token, or a matched project. Classify preserves the
deliberate "co-author the spec" model while removing a step from the common
path — and turns a resolved project into a visible destination instead of a
confirmation prompt.
