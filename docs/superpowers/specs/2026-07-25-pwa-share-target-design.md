# PWA Share-to-Inbox — Design

> **Status:** draft spec (pending implementation plan)
> **Date:** 2026-07-25
> **Owner:** design phase
> **Approach:** Option C — dedicated `/share` confirmation page (logged-out → re-share after login)

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
4. Sends the user to normal login when the session has expired; after login
   they land on `/app` and re-share. (We do not attempt to carry the share
   across login — see §Logged-out path.)

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
                      service worker → POST /api/share  (session-authed Wasp api, auth:true)
                          │            ─ composes "Title — url" (§Text composition)
                          │            ─ createInboxItemCore() (the existing pure core)
                          │
            ┌─────────────┴──────────────┐
            ▼                            ▼
       context.user set             context.user null
       (logged in)                  (logged out)
            │                            │
   303 → /share?id=<itemId>      303 → /login
            │                       (user signs in, lands on /app,
            │                        re-shares from source app)
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
- `action: "/share"` — share-target actions must stay on the PWA origin.
  The service worker intercepts this POST, forwards it to `/api/share` on the
  API origin with the session cookie, then redirects to `/share` for the
  confirmation page. The static client host does not handle POSTs itself.
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
    // Logged out: send to normal login. After auth the user lands on /app
    // as usual and re-shares. We do not attempt to carry the share payload
    // across the login redirect — the failure mode is "tap share again,"
    // which is acceptable (see §Logged-out path below).
    return res.redirect(303, "/login");
  }

  const text = composeShareText(extractFields(req.body));
  if (!text) return res.redirect(303, "/share?error=empty");

  try {
    const created = await createInboxItemCore(context.entities, {
      userId: context.user.id,
      text,
    });
    return res.redirect(303, `/share?id=${created.id}`);
  } catch (err) {
    console.error("[share] capture failed:", err);
    return res.redirect(303, "/share?error=server");
  }
};
```

**Form-body parsing:** Wasp's Express stack parses JSON by default, not URL-
encoded forms. The route must mount `express.urlencoded({ extended: true })`
via a per-route `middlewareConfigFn` (the Wasp-supported knob; same mechanism
the PAT routes use for their middleware). Implementation detail for the plan;
flagged here so the spec is honest about the dependency.

### 4. Logged-out path — re-share after login

When the share POST arrives without a session (`context.user` is null), the
handler does **not** attempt to carry the payload across login. It simply
`303`-redirects to `/login`. The user signs in, lands on `/app` per Wasp's
default `onAuthSucceededRedirectTo`, and re-shares from the source app.

**Why no signed-replay:** an earlier revision of this spec carried the share
across login via a short-lived HMAC-signed token + a `GET /api/share/replay`
handoff + a process-local LRU for replay protection. That's ~40% of the spec's
complexity (a new secret env var, two pure helpers, a second route, an LRU, a
login-redirect override) to serve a case the owner judges uncommon and cheap
to recover from ("tap share again"). The failure mode is honest and small:
a lost share on an expired session, recovered by one extra tap. Not worth the
machinery.

**What this removes vs. the earlier draft:** no `signPayload` / `verifyPayload`
helpers, no `SHARE_PAYLOAD_SECRET`, no `GET /api/share/replay` route, no
consumed-token LRU, no `return=/share&payload=` override on the login success
path. One route (`POST /api/share`), one redirect target (`/login`).

**If this proves painful in use,** the upgrade path is the signed-replay design
(archived in git history at the pre-revision commit) — the route shape and
`composeShareText` are unchanged, so the retrofit is additive, not a rewrite.

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

**Error states** — all share the same calm card layout (no checkmark), each
with its own copy and a recovery link. None auto-dismiss; the user reads and
dismisses manually. State is selected by the `?error=` query flag (or by
`getInboxItem` resolving null):

| State | When | Copy | Link |
|---|---|---|---|
| `?error=empty` | Share had no title/text/url | "Nothing to capture." | → `/app` ("Back to ActionAmp") |
| `?error=server` | `createInboxItemCore` threw (parser/DB) | "Capture failed — try again." | → `/app` |
| `?error=missing` | `?id=` absent, or `getInboxItem` returned null (wrong user / unknown / deleted) | "Couldn't find that capture." | → `/app` |

No `?error=expired` state exists — there is no token to expire (see §Logged-out
path). If the page is hit with an unknown `?error=` value, it falls through to
`?error=missing`.

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

1. User shares from another app → Android POSTs the form to `/share`. The
   service worker forwards it to `/api/share`, then redirects to `/share`.
2. `POST /api/share`:
   - Cookie present → `context.user` set → `composeShareText` →
     `createInboxItemCore` → `303 /share?id=<itemId>`.
   - Cookie absent → `303 /login` (user signs in, lands on `/app`, re-shares).
3. `GET /share?id=<itemId>` → `getInboxItem` → render chips + text → 3s →
   `window.close()` → fallback `navigate("/app")`.

## Error handling

Every error is a first-class page state on `/share` (see §Confirmation page
states). The `?error=` query flag selects which state renders.

| Surface | Redirect | Page state |
|---|---|---|
| Empty share (all fields blank) | `303 /share?error=empty` | "Nothing to capture." + link to `/app` |
| `createInboxItemCore` throws (parser error, DB error) | handler catches, logs `[share] failed:`, `303 /share?error=server` | "Capture failed — try again." + link to `/app` |
| Share arrives while logged out | `303 /login` | (no `/share` page; user signs in and re-shares) |
| `getInboxItem` returns null (wrong user / unknown id / deleted) | (no redirect; query resolves null on the page) | Page renders the `error=missing` state: "Couldn't find that capture." + link to `/app` |
| Network failure mid-POST | The share is lost (same as any failed capture). Browser shows its own network error; no recovery. Documented. |

## Testing

- **Unit — `composeShareText`:** every row of the field-combination table;
  truncation at 2000 chars (with `…`); empty → `""`.
- **Integration — `POST /api/share`:** with session cookie → 303 to
  `/share?id=...` + item created with composed text; without cookie → 303 to
  `/login`. Form body parses (urlencoded middleware). `createInboxItemCore`
  throw → 303 to `/share?error=server`.
- **Query — `getInboxItem`:** returns own item; returns null for another user's
  id; returns null for unknown id.
- **E2E (Playwright):** `GET /share?id=<itemId>` renders parsed chips + stored
  text, then auto-dismisses (close attempt → navigate to `/app` after 100ms —
  Playwright can't `window.close()`, so the fallback path is what's asserted).
  Each `?error=` state renders its own copy without auto-dismiss. `getInboxItem`
  returning null renders the `?error=missing` state.
- **Manual QA on Android (owner will test; not automated):** install the PWA,
  share a URL from Chrome, confirm (a) item lands in inbox with composed text,
  (b) Android returns to Chrome after the POST's 303. This is the only way to
  truly validate `share_target`.

## Documentation updates

- **`docs/features/pwa-notifications.md`** — new "Share target" section: the
  manifest block, the `/share` flow, the logged-out behavior (re-share after
  login), and the iOS gap.
- **`docs/ROADMAP.md`** — add this feature to the active list; reinforce the
  existing Icebox note that iOS share requires a native Share Extension
  (post-PMF).
- **`AGENTS.md` task-routing table** — new row: "Share-to-inbox (PWA
  `share_target`)" → `docs/features/pwa-notifications.md` +
  `webapp/src/share/`.

## Done conditions

- [ ] `manifest.json` has a valid `share_target` block.
- [ ] `POST /api/share` saves via `createInboxItemCore` and 303-redirects;
  logged-out → 303 to `/login`; `createInboxItemCore` throw → 303 to
  `/share?error=server`. Integration tests pass.
- [ ] `composeShareText` passes all field-combination + truncation unit tests.
- [ ] `getInboxItem` query added + registered; ownership guard tested.
- [ ] `/share` page renders all states (captured / `empty` / `server` /
  `missing`); captured state auto-dismisses; error states don't. Verified in
  Playwright.
- [ ] `ParsedCaptureChips` exported and reused by `/share` (no duplication).
- [ ] `docs/features/pwa-notifications.md` + `docs/ROADMAP.md` + `AGENTS.md`
  updated.
- [ ] `wasp compile` passes; existing tests still green.
- [ ] Owner's manual Android QA (not a code gate; tracked as a follow-up note).
