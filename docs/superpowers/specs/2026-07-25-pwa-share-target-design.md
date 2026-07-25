# PWA Share-to-Inbox — Design

> **Status:** draft spec (pending implementation plan)
> **Date:** 2026-07-25
> **Owner:** design phase
> **Approach:** Option C — dedicated `/share` confirmation page (full signed-replay logged-out path)

## Problem

The installed ActionAmp PWA is not a share target. When a user is in another app
(browser, Twitter, YouTube, notes) and hits the OS share sheet, ActionAmp is not
an option. They have to copy the link, switch to ActionAmp, open capture, paste.
For a capture-first app that friction is exactly wrong — the moment of "save
this" should be one tap.

## Goal

When the user installs the ActionAmp PWA and shares content from any other app,
ActionAmp appears in the share sheet. Selecting it:

1. Saves the shared content to the inbox as an `InboxItem` (composed from the
   share's `title` / `text` / `url` fields).
2. Opens the PWA on a full-screen `/share` page that shows what was captured
   (parsed chips + the stored text).
3. Auto-dismisses after ~3s (attempting to close the window back to the source
   app on Android; otherwise navigating to `/app`).
4. Never loses a share, even when the user is logged out — the payload survives
   the login redirect via a short-lived signed token.

## Non-goals

- **iOS share-sheet integration.** `share_target` is Android/Chrome-only; iOS
  Safari ignores it. iOS requires a native Share Extension, which is a post-PMF
  native-shell concern (see `docs/ROADMAP.md` Icebox). iOS users continue to use
  `⌘K` / paste capture. The manifest block is silently ignored on iOS — no
  feature detection, no false promises.
- **File sharing.** Out of scope. We accept only text fields (`title`/`text`/
  `url`). File sharing would need `multipart/form-data` + a `files` param and a
  storage backend; not now.
- **URL enrichment.** When the source sent only a URL (no title), we store it
  as-is. No server-side fetch for `<title>` / `og:title`. Capture stays instant
  and failure-free; the user can edit the title later in triage.
- **Service-worker interception.** The SW stays push-only
  (`webapp/public/service-worker.js`). The share POST is handled by a normal
  server route, not the SW. Authenticated data is never cached (existing rule).

## Platform reality

- **Android (Chrome):** `share_target` works. The OS opens the PWA's
  `share_target.action` URL as a top-level navigation, POSTing the form-encoded
  payload. When the POST returns a 3xx, the share activity dismisses and the
  user returns to the source app — this is Android's default behavior, not
  something we control.
- **Desktop Chrome / Edge:** `share_target` works (installed PWA only). No
  OS-level "return to source"; the window stays open, so the `/share` page's
  fallback `navigate("/app")` runs.
- **iOS / Safari:** no `share_target` support. The manifest block is ignored.
  No degradation needed — the feature simply doesn't surface.

The `wasp_session` cookie is `SameSite=lax`, which permits the share POST (a
top-level form navigation) to carry the cookie, so `auth: true` on the route
resolves `context.user` automatically.

## Architecture

```
[Other app] → share sheet → [ActionAmp PWA]
                                  │
                                  ▼  POST form-encoded (title/text/url)
                      manifest.json share_target.action = "/share"
                                  │
                                  ▼
                      POST /api/share  (session-authed Wasp api, auth:true)
                          │            ─ composes "Title — url" (§Text composition)
                          │            ─ createInboxItemCore() (the existing pure core)
                          │
            ┌─────────────┴──────────────┐
            ▼                            ▼
       context.user set             context.user null
       (logged in)                  (logged out)
            │                            │
   303 → /share?id=<itemId>      303 → /login?return=/share&payload=<signed>
            │                            │
            │                       (email auth runs normally)
            │                            │
            │                       303 → POST /api/share/replay?payload=<signed>
            │                            │  (verify sig + expiry + one-shot,
            │                            │   save via same core)
            │                            │
            │                       303 → /share?id=<itemId>
            ▼
       GET /share?id=<itemId>
       (full-screen "Captured" page, parsed chips + stored text)
            │
            ▼  ~3s after mount
       window.close() attempt
            │
            ▼  if still open after 100ms
       navigate("/app")
```

### Reuse map

Everything below already exists in the codebase. The feature adds glue, not new
mechanisms.

| Need | Reuse |
|------|-------|
| Save text to inbox | `createInboxItemCore` (`webapp/src/inbox/operationsCore.ts:58`) — the pure core the Wasp `createInboxItem` action and the CLI `cliCapture` route both call. |
| Session-authed server route | The `api("POST", "/api/pat/*", ..., { auth: true })` family (`main.wasp.ts:305-316`). `auth:true` resolves `context.user` from the cookie the share POST carries. |
| Route handler shape | `cliCapture` (`webapp/src/auth/patRoutes.ts:360-383`) — same idea, different auth source (`context.user` vs `req.patUser`) and response (303 vs JSON). |
| One-shot URL flag pattern | `/app?capture=1` (`webapp/src/app/AppShell.tsx:304-310`) — same "read query param, act, strip param" idea. |
| Captured-confirmation visual | `.aa-capture__captured*` CSS + `aa-capture-slidein` keyframe (`webapp/src/components/ui/Overlays.css:463-524`); `ParsedCaptureChips` (`CapturePopover.tsx:384`, currently file-private — must add `export`). |
| Post-capture invalidation | `queryClient.invalidateQueries(["getInboxItems"])` + `["getAppData"]` (mirror of `AppShell.tsx:611-622`). |
| Env secret | `process.env.SHARE_PAYLOAD_SECRET` read at module top-level (mirrors `billing/stripe.ts:9`'s `process.env.STRIPE_SECRET_KEY`). Added to `webapp/.env.server`. |

The parser, the data model, entitlements, the service worker, and the existing
`createInboxItem` action are all **untouched**.

## Components

### 1. `manifest.json` — add `share_target`

Append to `webapp/public/manifest.json`:

```json
"share_target": {
  "action": "/share",
  "enctype": "application/x-www-form-urlencoded",
  "method": "POST",
  "params": {
    "title": "title",
    "text": "text",
    "url": "url"
  }
}
```

- `method: "POST"` (not GET) — keeps the payload out of URLs/history/referrers.
- `enctype: "application/x-www-form-urlencoded"` (not `multipart/form-data`) —
  text fields only; smaller payload, simpler parsing.
- `action: "/share"` — same path serves the POST (server route → 303) and the
  GET (the confirmation page). One URL, two methods.
- `params` maps the share sheet's `title`/`text`/`url` keys to form field names.

### 2. Text composition — `composeShareText`

Pure helper, unit-tested. Input: a form body (`{ title?, text?, url? }`, each
`string | undefined`). Output: the single `text` string stored on the
`InboxItem`, or `""` if nothing shareable.

**Field-combination rules:**

| Fields present | Stored `text` |
|---|---|
| `title` + `url` | `{title} — {url}` |
| `title` only | `{title}` |
| `url` only | `{url}` |
| `text` + `url` | `{text} — {url}` |
| `text` only | `{text}` |
| `title` + `text` + `url` | `{title}: {text} — {url}` |
| none (all empty) | `""` → handler returns `400` path |

**Headline precedence:** `title` > `text` > (no headline). URL always appended
last, after an em-dash separator (` — `). NL parser runs on the result, so a
shared tweet whose title contains `#work` parses the tag.

**Truncation:** each field capped at 2000 chars before composition. If
truncated, the field ends with `…`. Defensive against huge text selections
blowing up the inbox list.

### 3. Server route — `POST /api/share`

New Wasp route in `main.wasp.ts`:

```ts
api("POST", "/api/share", shareCapture, {
  entities: ["InboxItem", "User", "Lens"],
  auth: true,
})
```

Handler at `webapp/src/share/shareCapture.ts` (new feature folder, vertical
layout per AGENTS.md):

```ts
export const shareCapture = async (req, res, context) => {
  // auth:true → context.user is set iff the cookie was present
  if (!context.user) {
    return res.redirect(303, signLoginRedirect(extractFields(req.body)));
  }

  const text = composeShareText(extractFields(req.body));
  if (!text) return res.redirect(303, "/share?error=empty");

  const created = await createInboxItemCore(context.entities, {
    userId: context.user.id,
    text,
  });
  return res.redirect(303, `/share?id=${created.id}`);
};
```

**Form-body parsing:** Wasp's Express stack parses JSON by default, not URL-
encoded forms. The route must mount `express.urlencoded({ extended: true })`
via a per-route `middlewareConfigFn` (the Wasp-supported knob; same mechanism
the PAT routes use for their middleware). Implementation detail for the plan;
flagged here so the spec is honest about the dependency.

### 4. Logged-out path — signed replay

Two new pure helpers, unit-tested: `signPayload(fields)` → token string,
`verifyPayload(token)` → `{ ok, fields } | { ok: false, reason }`.

**Token format:** `base64url(JSON.stringify({ fields, exp })) + "." + base64url(HMAC-SHA256(payload, secret))`.
`exp` = `Date.now() + 60_000` (60s). Secret = `process.env.SHARE_PAYLOAD_SECRET`
(read at module top-level; if unset in dev, fall back to a hardcoded dev value
+ log a warning — never to a random per-process value, which would break across
the redirect).

**Replay protection:** a process-local LRU set (cap 1000) of consumed token
signatures (the HMAC portion). `verifyPayload` rejects any token whose
signature is already in the set; on success, the signature is added. This
prevents a leaked/observed URL from being replayed within its 60s window. Not
distributed — acceptable because the window is short and the payload is just
title/text/url (no PII, no auth escalation).

**`/login` redirect:** `303 → /login?return=/share&payload=<token>`. Wasp's
default `onAuthSucceededRedirectTo: "/app"` is a GET. To turn the post-auth
redirect into a `POST /api/share/replay?payload=<token>`, the login success
page reads `?return=/share&payload=...` and, when present, renders a tiny
auto-submitting form (method POST, action `/api/share/replay`) carrying the
payload as a hidden field — instead of navigating to `/app`. This is a small,
self-contained patch to the existing login success path; no Wasp auth internals
are touched. (Implementation shape — exact file/insertion point — is a plan
detail.)

**`POST /api/share/replay`** — second Wasp route, same middleware shape:

```ts
api("POST", "/api/share/replay", shareReplay, {
  entities: ["InboxItem", "User", "Lens"],
  auth: true,   // user must be authed by now
})
```

```ts
export const shareReplay = async (req, res, context) => {
  if (!context.user) return res.redirect(303, "/login");
  const token = typeof req.query?.payload === "string" ? req.query.payload : "";
  const result = verifyPayload(token);   // also marks consumed
  if (!result.ok) return res.redirect(303, "/share?error=expired");
  const text = composeShareText(result.fields);
  if (!text) return res.redirect(303, "/share?error=empty");
  const created = await createInboxItemCore(context.entities, {
    userId: context.user.id,
    text,
  });
  return res.redirect(303, `/share?id=${created.id}`);
};
```

**Failure modes:**

| Case | Redirect |
|------|----------|
| Token signature invalid / tampered | `/share?error=expired` |
| Token past 60s expiry | `/share?error=expired` |
| Token already consumed (replay) | `/share?error=expired` |
| `SHARE_PAYLOAD_SECRET` unset (prod) | handler throws 500 at boot; never silently falls back in prod |
| Replay runs but `composeShareText` empty (race) | `/share?error=empty` |

### 5. Confirmation page — `/share`

New page `webapp/src/share/SharePage.tsx`, registered in `main.wasp.ts` as a
route reachable both authed and during the post-login window.

**State A — `?id=<itemId>` (happy path, just captured):**

- Full-screen, calm, centered card. Lots of whitespace.
- Top: teal checkmark + "Captured" (reuses `.aa-capture__captured-check` markup
  + `aa-capture-slidein` keyframe).
- Below: parsed-chip preview via `ParsedCaptureChips` (exported from
  `CapturePopover.tsx`, `variant="captured"` — compact: bare ★, ≤2 tags,
  project, lens if parsed).
- Below that: the stored `text`, truncated to ~3 lines with ellipsis.
- Fetches the item by id via a **new** `getInboxItem` query (see below), gated
  to `item.userId === context.user.id`.
- A subtle "View in inbox" link under the chips.
- **~3s after mount:** `queryClient.invalidateQueries(["getInboxItems"])` +
  `["getAppData"]` (so the sidebar inbox count updates), then
  `window.close()`. If the window is still open 100ms later (close failed — the
  common case for OS-opened windows), `navigate("/app")`.

**State B — `?error=empty` (nothing to capture):**

- Same card layout, no checkmark. Calm copy: "Nothing to capture." + a "Back to
  ActionAmp" link to `/app`. No auto-dismiss — the user dismisses manually.

**State C — `?error=expired` (logged-out replay failed):**

- Same card. Copy: "Your share expired — sign in and try again." + link to
  `/login`. No auto-dismiss.

**Visual treatment:** match the existing captured-toast aesthetic — teal
checkmark (system/state accent), neutral card, system font, generous
whitespace. Per the "calm over features" rule: no exclamation marks, no
streaks, no animation beyond `aa-capture-slidein`.

**New query — `getInboxItem`:**

```ts
// webapp/src/inbox/operations.ts
export const getInboxItem = (async ({ id }: { id: string }, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const item = await context.entities.InboxItem.findUnique({ where: { id } });
  if (!item || item.userId !== context.user.id) return null;
  return item;
}) satisfies GetInboxItem<{ id: string }>;
```

Registered in `main.wasp.ts` alongside the existing inbox queries:
`query(getInboxItem, { entities: ["InboxItem"], auth: true })`.

Mirrors `restoreArchivedItem`'s `findUnique` + userId guard pattern
(`operations.ts:123`), but returns the full row and is a query (read), not an
action (write).

### 6. `ParsedCaptureChips` export

Currently file-private in `webapp/src/components/ui/CapturePopover.tsx:384`. Add
`export` to the function declaration. Pure component (renders only from
`parsed` props + the local `formatPreviewDate` helper; no queries/effects) —
safe to lift. `SharePage` imports it alongside the `ParsedCapture` type.

## Data flow

1. User shares from another app → Android opens the installed PWA at `/share`
   with a POSTed form (`title` / `text` / `url`).
2. `POST /api/share`:
   - Cookie present → `context.user` set → `composeShareText` →
     `createInboxItemCore` → `303 /share?id=<itemId>`.
   - Cookie absent → `signPayload` → `303 /login?return=/share&payload=<token>`.
3. (Logged-out branch) Email auth runs. Post-auth, `return=/share` redirects to
   `POST /api/share/replay?payload=<token>` → `verifyPayload` (consumes) →
   `composeShareText` → `createInboxItemCore` → `303 /share?id=<itemId>`.
4. `GET /share?id=<itemId>` → `getInboxItem` → render chips + text → 3s →
   `window.close()` → fallback `navigate("/app")`.

## Error handling

| Surface | Behavior |
|---|---|
| Empty share (all fields blank) | `303 /share?error=empty`; page shows "Nothing to capture." |
| `createInboxItemCore` throws (e.g., parser error) | Handler catches, logs `[share] failed:`, `303 /share?error=server`; page shows "Capture failed — try again." + link to `/app`. |
| Replay token invalid/expired/replayed | `303 /share?error=expired`; page shows expired message. |
| `getInboxItem` returns null (wrong user / deleted) | Page falls through to State B copy ("Nothing to capture.") with link to `/app`. |
| `SHARE_PAYLOAD_SECRET` unset in prod | Server boot fails loudly (no silent fallback). Dev falls back to a documented constant + warning log. |
| Network failure mid-replay | The share is lost (same as any failed capture). Documented; not recovered. |

## Testing

- **Unit — `composeShareText`:** every row of the field-combination table;
  truncation at 2000 chars (with `…`); empty → `""`.
- **Unit — `signPayload` / `verifyPayload`:** round-trip; tampered payload
  rejected; expired rejected; consumed-token replay rejected; `exp` honored.
- **Integration — `POST /api/share`:** with session cookie → 303 to
  `/share?id=...` + item created with composed text; without cookie → 303 to
  `/login?return=/share&payload=...`. Form body parses (urlencoded middleware).
- **Integration — `POST /api/share/replay`:** valid token → 303 + item created;
  invalid/expired/consumed → 303 to `?error=expired`.
- **Query — `getInboxItem`:** returns own item; returns null for another user's
  id; returns null for unknown id.
- **E2E (Playwright):** `GET /share?id=<itemId>` renders parsed chips + stored
  text, then auto-dismisses (close attempt → navigate to `/app` after 100ms —
  Playwright can't `window.close()`, so the fallback path is what's asserted).
  `?error=empty` and `?error=expired` render their respective states without
  auto-dismiss.
- **Manual QA on Android (documented in feature doc, not automated):** install
  the PWA, share a URL from Chrome, confirm (a) item lands in inbox with
  composed text, (b) Android returns to Chrome after the POST's 303. This is
  the only way to truly validate `share_target`.

## Documentation updates

- **`docs/features/pwa-notifications.md`** — new "Share target" section: the
  manifest block, the `/share` flow, the logged-out replay, and the iOS gap.
- **`docs/ROADMAP.md`** — add this feature to the active list; reinforce the
  existing Icebox note that iOS share requires a native Share Extension
  (post-PMF).
- **`AGENTS.md` task-routing table** — new row: "Share-to-inbox (PWA
  `share_target`)" → `docs/features/pwa-notifications.md` +
  `webapp/src/share/`.

## Done conditions

- [ ] `manifest.json` has a valid `share_target` block.
- [ ] `POST /api/share` saves via `createInboxItemCore` and 303-redirects;
  unit + integration tests pass.
- [ ] `POST /api/share/replay` saves via the same core; token sign/verify/
  expiry/replay tests pass.
- [ ] `composeShareText` passes all field-combination + truncation unit tests.
- [ ] `getInboxItem` query added + registered; ownership guard tested.
- [ ] `/share` page renders all three states (captured / empty / expired);
  auto-dismiss behavior verified in Playwright.
- [ ] `ParsedCaptureChips` exported and reused by `/share` (no duplication).
- [ ] `SHARE_PAYLOAD_SECRET` documented in `webapp/AGENTS.md` env section.
- [ ] `docs/features/pwa-notifications.md` + `docs/ROADMAP.md` + `AGENTS.md`
  updated.
- [ ] `wasp compile` passes; existing tests still green.
- [ ] Manual Android QA pass documented (or explicitly deferred with a note).
