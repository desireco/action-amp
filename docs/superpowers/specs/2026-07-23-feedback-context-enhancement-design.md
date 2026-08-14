# Feedback Context Enhancement

**Date:** 2026-07-23
**Status:** Ready for implementation
**Scope:** Enrich feedback context capture + surface it in admin triage surfaces.

## Problem

Two gaps in the feedback system:

1. **Capture inconsistency.** Three call sites submit feedback, and they disagree:
   - `AppShell.tsx` (the loudspeaker button) sends `route = pathname + search` and
     derives `section` via `sectionForPath()`.
   - `TodayPage.tsx` and `TaskDetailPage.tsx` send `route = pathname` (no query
     string) and hardcode `section: "work"`.
   So the same screen produces different context depending on which trigger the
   user reached it from.

2. **Missing diagnostic context.** When triaging a bug report the admin often
   can't answer "is this mobile?" or "what timezone were they in?" — both common
   first questions for date/CSS bugs. Capturing viewport size + timezone at
   submit time is a one-liner each and removes a round-trip with the reporter.

3. **Display gap.** `route` has been captured since v1 but is **not shown** in
   the admin dashboard table or the admin CLI `list` line — only in the CLI
   `show` detail view. So the "where did this happen?" signal is collected but
   invisible at triage time.

## Non-goals

- No app-version / build field this round (needs a version source to exist
  first; revisit when there's a deploy pipeline emitting a build id).
- No theme capture (low signal; deferred).
- No schema change to `route`/`section` themselves (stays `String?`, unindexed).
- No new admin filters (the dashboard stays a recent-list, not a query tool).

## Decisions locked

- **New fields**: `viewport` and `timezone`, as dedicated `String?` columns on
  `Feedback`. Dedicated (not a JSON blob) so they're typed, individually
  nullable, and trivially queryable later.
- **Capture unification**: extract a single shared helper that all three call
  sites use. Fixes the pathname-only bug as a side effect.
- **Dashboard table**: add one new column — **Route** — showing section + route.
  Viewport/timezone stay out of the table (too noisy at a glance); they live in
  the detail view.
- **CLI list line**: append route.
- **CLI show detail**: append `viewport` and `tz`.

## Design

### 1. Schema (`webapp/schema.prisma`)

Add two optional columns to `Feedback`:

```prisma
model Feedback {
  // …existing fields…
  userAgent String?
  viewport  String?   // NEW — e.g. "1440x900" (innerWidth x innerHeight)
  timezone  String?   // NEW — IANA tz, e.g. "America/Toronto"
}
```

Both nullable (old rows + non-browser submits stay valid), no index, no default.

**Migration:** `wasp db migrate-dev --name feedback_context_fields`.

### 2. Capture unification (client)

Create `webapp/src/feedback/captureContext.ts` — a pure helper that gathers all
client-side context into the shape `submitFeedback` expects:

```ts
export type FeedbackCaptureContext = {
  route: string;
  section: "work" | "plan" | "review";
  userAgent: string | null;
  viewport: string | null;   // "WxH" or null (SSR / unavailable)
  timezone: string | null;   // IANA tz or null
};

export function captureFeedbackContext(
  location: { pathname: string; search: string },
): FeedbackCaptureContext { … }
```

- `sectionForPath` moves here from `AppShell.tsx` (and is re-exported from
  AppShell if anything else still imports it — check first; if not, drop the
  re-export).
- All `window`/`navigator`/`Intl` access is guarded (`typeof window ===
  "undefined"` → null) so the helper is SSR-safe.
- `viewport = window.innerWidth && window.innerHeight ?
  \`${innerWidth}x${innerHeight}\` : null`.

**All three call sites** (`AppShell.tsx`, `TodayPage.tsx`, `TaskDetailPage.tsx`)
switch to:

```ts
await submitFeedback({ message, ...captureFeedbackContext(location), lens });
```

This removes the per-site duplication *and* fixes the pathname-only bug — every
site now sends `pathname + search`, the real `section`, viewport, and timezone.

> Note: `TodayPage`/`TaskDetailPage` prefix their message with
> `"Done task feedback: …"`. That prefixing stays at the call site (it's
> message-specific); only the context block moves into the helper.

### 3. Server write path (`webapp/src/feedback/`)

- **`operations.ts`**: extend `SubmitFeedbackArgs` with `viewport?: string |
  null` and `timezone?: string | null`. Pass both through to `submitFeedbackCore`.
- **`operationsCore.ts`**:
  - Add `viewport`, `timezone` to `FEEDBACK_SELECT`.
  - Add them to the `submitFeedbackCore` args type + the `data:` block, clamped
    via `cleanOptional` (viewport ≤ 20, timezone ≤ 60).
- **Email** (`operations.ts` `buildFeedbackEmail` + `FeedbackEmail` template):
  append `viewport` and `timezone` lines to the email body when present. Update
  `FeedbackEmailInput` to carry them.

### 4. Admin read path (`webapp/src/admin/operationsCore.ts`)

- Add `viewport`, `timezone` to `FeedbackRow` type and the admin
  `FEEDBACK_SELECT` mirror.

### 5. Dashboard table (`webapp/src/admin/AdminPage.tsx`)

Add a **Route** column between Message and From:

```tsx
{
  key: "route",
  header: "Route",
  render: (r) =>
    r.route ? (
      <span title={r.route}>
        <span className="aa-feedback-route-section">{r.section ?? "—"}</span>
        {" "}
        {r.route}
      </span>
    ) : (
      "—"
    ),
},
```

- Truncate visually (CSS `max-width` + ellipsis) so a long query string doesn't
  blow out the row; full route in the `title` tooltip.
- Section shown as a small muted prefix so the admin gets the coarse bucket at
  a glance without reading the path.

### 6. Admin CLI

- **`admin-cli/src/types.ts`**: add `viewport`, `timezone` to the `Feedback`
  type (mirror backend).
- **`output.ts`**:
  - `formatFeedbackLine`: append route after the message —
    `${firstLine} · ${from} · ${route || "—"}`.
  - `formatFeedbackDetail`: add
    `if (f.viewport) lines.push(\`viewport:  ${f.viewport}\`)` and
    `if (f.timezone) lines.push(\`timezone: ${f.timezone}\`)`. Labels match the
    existing `route:` / `section:` / `agent:` key column width (9 chars, so
    `viewport:` and `timezone:` both align).

### 7. Feature doc

Update `docs/features/feedback.md` to list the two new context fields and the
unified capture helper, with a "verified" date bump.

## Files touched

| File | Change |
|------|--------|
| `webapp/schema.prisma` | + `viewport`, `timezone` columns |
| `webapp/migrations/<new>/migration.sql` | generated |
| `webapp/src/feedback/captureContext.ts` | **new** — shared capture helper |
| `webapp/src/feedback/operations.ts` | args + email input + email body |
| `webapp/src/feedback/operationsCore.ts` | `FEEDBACK_SELECT` + create data |
| `webapp/src/email/FeedbackEmail.tsx` | render viewport + timezone lines |
| `webapp/src/admin/operationsCore.ts` | `FeedbackRow` + admin select |
| `webapp/src/admin/AdminPage.tsx` | Route column |
| `webapp/src/app/AppShell.tsx` | use helper; drop local `sectionForPath` |
| `webapp/src/lists/TodayPage.tsx` | use helper |
| `webapp/src/tasks/TaskDetailPage.tsx` | use helper |
| `admin-cli/src/types.ts` | type mirror |
| `admin-cli/src/output.ts` | list line + detail view |
| `docs/features/feedback.md` | doc update |

## Testing

- **Unit** (`webapp/src/feedback/operationsCore.test.ts` if present, else add):
  `submitFeedbackCore` persists viewport/timezone when provided, stores null
  when omitted, clamps overlong values.
- **Unit** (new `captureContext.test.ts`): SSR guards return null; pathname +
  search concatenated; `sectionForPath` bucketing.
- **Unit** (`admin-cli`): `formatFeedbackLine` / `formatFeedbackDetail` render
  the new fields; null fields are omitted (detail) or shown as `—` (line).
- **Manual**: dev autologin → submit feedback from `/do`, `/do/upcoming`,
  `/do/logbook`; confirm dashboard Route column + CLI `show` show viewport/tz.

## Verification (done when)

- [ ] `wasp compile` clean.
- [ ] Migration applies; old rows have null viewport/timezone.
- [ ] Submitting from all three triggers stores identical context shape.
- [ ] Dashboard table shows a Route column; tooltip shows full route.
- [ ] `actionamp-admin feedback list` lines include route.
- [ ] `actionamp-admin feedback show <id>` shows viewport + timezone.
- [ ] Email body includes viewport + timezone when present.
- [ ] `--json` output of `feedback list`/`show` carries the new fields.
