# 4 July Weekend — Commit Summary & Stats

**Window:** 2026-07-04 + 2026-07-05

## Stats

| | Commits | Insertions | Deletions |
|---|---|---|---|
| **07-04** | 60 | 14,834 | 5,139 |
| **07-05** | 56 | 15,145 | 4,011 |
| **Total** | **117** | **29,979** | **9,150** |

Net ≈ **+20,829 LOC** across 2 days. ~58 commits/day avg.

### By type (conventional commits)
- **feat** 29 · **refactor** 18 · **docs** 11 · **fix** 10 · **style** 6 · **chore** 6 · **test** 3 · copy/merge/uncategorized rest

### Hottest scopes
`tasks`(9) · `focus`(9) · `ui`(7) · `triage`(7) · `design-system`(6) · `design`(5) · `capture`(5) · `lists`(4) · `today`(3) · `projects`(3) · `inbox`(3) · `upcoming`(2)

---

## Feature themes shipped

### 1. Capture grammar v2 — full parser rewrite
- `#` projects, `@` time-only, `[[lens]]` token
- Inline `#` autocomplete (projects + tags, caret-anchored)
- `parsedLens` field + lens-agnostic resolver ops

### 2. Triage classify step — co-author UI
- Lens inference (`[[ ]]` + project-bridge + free-text resolver)
- Type chooser rows, lens pills, goal meta on pickers, back-button nav

### 3. Goal planning — full lifecycle
- Server ops: lifecycle / edit / delete / re-link / reorder
- `Project.order` for goal-scoped sequencing
- UI: lifecycle, Next: line, completed goals in Logbook + Reopen
- e2e: full sequence → complete → logbook → reopen

### 4. Task notes + completion log
- `TaskUpdate.kind` discriminator (NOTE | COMPLETED)
- Notes thread + composer in Focus mode
- Notes captured in triage, editable from task rows

### 5. Focus redesign (Variant F) — locked spec → impl
- Dedicated focus route, margin clock (session live + total honest)
- Summoned composer, confirm-on-complete
- `TaskSession` model for focus-segment accounting

### 6. Task page — full-field editing
- Task permalinks + chip-popover editor
- Shared `PropertyChips` (extracted from triage + task page)
- Completed task detail → feedback-only

### 7. Custom lenses (Pro feature)
- Adaptive switcher (chip+popover at ≥4) + `⌘L`
- `createLens` / `updateLens` / `deleteLens` server actions
- Settings Lenses tab — Pro CRUD + FREE ProGate
- `isAdmin` staff/dev bypass in entitlement layer
- 6 curated lens hue ramps in tokens

### 8. Lists restructure
- Upcoming promoted to top-level Plan nav item
- Single Upcoming surface, dropped Today bench, cross-links
- Today/Upcoming polish pass

### 9. Design-system token migration
- Type scale + semantic aliases added
- `font-size` / `line-height` / `font-weight 400` migrated to tokens across `components/ui/`, `app/`, feature pages, lenses
- Consolidated `focus-ring` / `empty-mark` / `lens-halo`

### 10. Cleanup / refactor pass
- Broke barrel-file import cycles (7 components)
- Removed 12 unused exports + vestigial `SettingsPage.css`
- Extracted `CloseButton`, `useTaskListActions`, `groupByGoal`, `TaskRowNotes`, `dateFormat.ts`
- Dropped unused `react-hook-form` dep
- `prefers-reduced-motion` blocks added everywhere motion exists

### 11. Infra / ops
- Local dev autologin route (`/login?devEmail=`)
- Public `/roadmap` page + footer links
- `scripts/new-spec.sh` scaffolding helper
- Fallow static-analysis config + findings doc

### Docs
- task-fields spec (Context + Outcome)
- Focus redesign mockups A–F
- Moment-bar mockup
- Capture grammar spec cascade
- Custom-lenses review
- Stale-docs prune
