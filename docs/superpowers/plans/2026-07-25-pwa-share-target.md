# PWA Share-to-Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed ActionAmp PWA a share target on Android/Chrome — sharing from another app opens the PWA, saves the content to the inbox via `createInboxItemCore`, and shows a full-screen `/share` confirmation that auto-dismisses in ~3s.

**Architecture:** A `share_target` block in `manifest.json` POSTs the form-encoded share payload to a new session-authed route `POST /api/share`, which composes a single `text` string and saves via the existing pure `createInboxItemCore`. The route 303-redirects to `/share?id=<itemId>` (happy path), `/login` (logged out), or `/share?error=<code>` (empty/server). The `/share` page renders a calm confirmation (reusing `ParsedCaptureChips` + the captured-toast CSS) or a first-class error state. Logged-out shares are not preserved — the user signs in and re-shares.

**Tech Stack:** Wasp `^0.24` (TypeScript Spec), React 19, Prisma, Express, Vitest, Playwright. New code lives in a vertical `webapp/src/share/` folder.

**Spec:** `docs/superpowers/specs/2026-07-25-pwa-share-target-design.md`

---

## File Structure

**Create:**
- `webapp/src/share/composeShareText.ts` — pure helper: form fields → stored `text` string. Unit-tested.
- `webapp/src/share/composeShareText.test.ts` — unit tests for the above.
- `webapp/src/share/shareRouteMiddleware.ts` — Wasp `MiddlewareConfigFn` that ensures `express.urlencoded({ extended: true })` is in the route's stack.
- `webapp/src/share/shareCapture.ts` — `POST /api/share` handler.
- `webapp/src/share/SharePage.tsx` — the `/share` confirmation page (captured / empty / server / missing states).
- `webapp/src/share/SharePage.css` — page styles (reuses existing captured-toast tokens where possible).

**Modify:**
- `webapp/public/manifest.json` — add `share_target` block.
- `webapp/src/inbox/operations.ts` — add `getInboxItem` query export.
- `webapp/src/inbox/operations.ts` (imports) — add `GetInboxItem` to the type import.
- `webapp/src/components/ui/CapturePopover.tsx:384` — add `export` to `ParsedCaptureChips`.
- `webapp/main.wasp.ts` — register the `POST /api/share` route, the `/share` page route, and the `getInboxItem` query; add the component/handler imports.
- `docs/features/pwa-notifications.md` — new "Share target" section.
- `docs/ROADMAP.md` — add to active list.
- `AGENTS.md` — new task-routing row.

**Untouched (per spec):** the parser, the Prisma schema, entitlements, the service worker, the existing `createInboxItem` action, the existing `getInboxItems` query.

---

## Task 1: `composeShareText` pure helper (TDD)

**Files:**
- Create: `webapp/src/share/composeShareText.ts`
- Create: `webapp/src/share/composeShareText.test.ts`

- [ ] **Step 1: Write the failing test**

Create `webapp/src/share/composeShareText.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeShareText } from "./composeShareText";

describe("composeShareText", () => {
  it("returns empty when all fields absent", () => {
    expect(composeShareText({})).toBe("");
    expect(composeShareText({ title: "", text: "", url: "" })).toBe("");
    expect(composeShareText({ title: "   ", url: " " })).toBe("");
  });

  it("title + url → 'Title — url'", () => {
    expect(composeShareText({ title: "Cool Page", url: "https://x.com" }))
      .toBe("Cool Page — https://x.com");
  });

  it("title only → title", () => {
    expect(composeShareText({ title: "Just a title" })).toBe("Just a title");
  });

  it("url only → url", () => {
    expect(composeShareText({ url: "https://x.com" })).toBe("https://x.com");
  });

  it("text + url → 'text — url'", () => {
    expect(composeShareText({ text: "a note", url: "https://x.com" }))
      .toBe("a note — https://x.com");
  });

  it("text only → text", () => {
    expect(composeShareText({ text: "just text" })).toBe("just text");
  });

  it("title + text + url → 'title: text — url'", () => {
    expect(composeShareText({
      title: "Headline", text: "body", url: "https://x.com",
    })).toBe("Headline: body — https://x.com");
  });

  it("truncates each field to 2000 chars with ellipsis", () => {
    const long = "a".repeat(2500);
    const out = composeShareText({ title: long, url: "https://x.com" });
    // title truncated to 2000 + "…", then " — https://x.com"
    expect(out).toBe("a".repeat(2000) + "… — https://x.com");
  });

  it("trims whitespace from each field before composing", () => {
    expect(composeShareText({ title: "  Cool  ", url: "  https://x.com  " }))
      .toBe("Cool — https://x.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `webapp/`:
```bash
npx vitest run src/share/composeShareText.test.ts
```
Expected: FAIL — `Cannot find module './composeShareText'`.

- [ ] **Step 3: Write minimal implementation**

Create `webapp/src/share/composeShareText.ts`:

```ts
// Composes the share payload's title/text/url fields into the single `text`
// string stored on the InboxItem. Pure; unit-tested.
//
// Rules (see docs/superpowers/specs/2026-07-25-pwa-share-target-design.md):
//   title + url → "Title — url"
//   title only  → "Title"
//   url only    → "url"
//   text + url  → "text — url"
//   text only   → "text"
//   title + text + url → "Title: text — url"
//   nothing     → ""  (caller treats as error)
// Each field is truncated to MAX_FIELD_LEN chars (+ "…") before composing.

const MAX_FIELD_LEN = 2000;

export type ShareFields = {
  title?: string;
  text?: string;
  url?: string;
};

function clean(v: string | undefined): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  if (trimmed.length <= MAX_FIELD_LEN) return trimmed;
  return trimmed.slice(0, MAX_FIELD_LEN) + "…";
}

export function composeShareText(fields: ShareFields): string {
  const title = clean(fields.title);
  const text = clean(fields.text);
  const url = clean(fields.url);

  // No content at all → empty (caller decides what to do).
  if (!title && !text && !url) return "";

  // URL always appended last, after " — ", when present.
  const tail = url ? ` — ${url}` : "";

  if (title && text) return `${title}: ${text}${tail}`;
  if (title) return `${title}${tail}`;
  if (text) return `${text}${tail}`;
  // Only url.
  return url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run src/share/composeShareText.test.ts
```
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/share/composeShareText.ts webapp/src/share/composeShareText.test.ts
git commit -m "feat(share): add composeShareText pure helper + tests"
```

---

## Task 2: `shareRouteMiddleware` (urlencoded body parsing)

**Files:**
- Create: `webapp/src/share/shareRouteMiddleware.ts`

- [ ] **Step 1: Write the middleware**

Create `webapp/src/share/shareRouteMiddleware.ts`:

```ts
import express from "express";
import type { MiddlewareConfigFn } from "wasp/server";

// Ensures the share POST route parses `application/x-www-form-urlencoded`
// bodies (the enctype declared in manifest.json's share_target). Wasp's
// default global stack includes express.urlencoded, but setting it explicitly
// on the route (a) makes the dependency obvious to readers, and (b) guarantees
// `{ extended: true }` regardless of the default's options.
//
// Modeled on webapp/src/billing/webhookMiddleware.ts.
export const shareRouteMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.set(
    "express.urlencoded",
    express.urlencoded({ extended: true }),
  );
  return middlewareConfig;
};
```

- [ ] **Step 2: Commit**

(No unit test for this — it's a one-line middleware config. Verified end-to-end in Task 4's integration test.)

```bash
git add webapp/src/share/shareRouteMiddleware.ts
git commit -m "feat(share): urlencoded middleware for /api/share route"
```

---

## Task 3: `getInboxItem` query

**Files:**
- Modify: `webapp/src/inbox/operations.ts` (add export + type import)

- [ ] **Step 1: Read the current operations.ts head + an existing query**

Open `webapp/src/inbox/operations.ts`. Note the import block at the top (lines 1-7) imports operation types from `wasp/server/operations`, and `getInboxItems` is defined around line 49.

- [ ] **Step 2: Add `GetInboxItem` to the type import**

In `webapp/src/inbox/operations.ts`, edit the type-import block to add `GetInboxItem`. After the edit it should read:

```ts
import type {
  CreateInboxItem,
  GetInboxItem,
  GetInboxItems,
  TriageInboxItem,
  RestoreArchivedItem,
  GetProjectsForResolver,
} from "wasp/server/operations";
```

- [ ] **Step 3: Add the `getInboxItem` query export**

Append to `webapp/src/inbox/operations.ts` (after `getInboxItems`, before `triageInboxItem` or at end of file — keep it next to `getInboxItems` for locality):

```ts
// Fetch a single InboxItem by id, gated to the requesting user. Used by the
// /share confirmation page to render the just-captured item. Returns null for
// an unknown id, a deleted item, or another user's item — callers render the
// "missing" error state. Mirrors restoreArchivedItem's findUnique + userId
// guard, but is a read query and returns the full row.
export const getInboxItem = (async (
  args: { id: string },
  context,
) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const item = await context.entities.InboxItem.findUnique({
    where: { id: args.id },
  });
  if (!item || item.userId !== context.user.id) return null;
  return item;
}) satisfies GetInboxItem<{ id: string }>;
```

- [ ] **Step 4: Register the query in `main.wasp.ts`**

In `webapp/main.wasp.ts`, the inbox queries import (around line 22) currently reads:

```ts
import { createInboxItem, getInboxItems, triageInboxItem, restoreArchivedItem, getProjectsForResolver } from "./src/inbox/operations"
```

Add `getInboxItem`:

```ts
import { createInboxItem, getInboxItem, getInboxItems, triageInboxItem, restoreArchivedItem, getProjectsForResolver } from "./src/inbox/operations"
```

Then, next to the existing inbox query registration (around line 279):

```ts
    query(getInboxItems, { entities: ["InboxItem"], auth: true }),
```

Add:

```ts
    query(getInboxItem, { entities: ["InboxItem"], auth: true }),
```

- [ ] **Step 5: Verify it compiles**

Run from `webapp/`:
```bash
wasp compile
```
Expected: succeeds with no errors. (If `wasp` isn't on PATH, `npx wasp compile` from the `webapp/` dir.)

- [ ] **Step 6: Commit**

```bash
git add webapp/src/inbox/operations.ts webapp/main.wasp.ts
git commit -m "feat(inbox): add getInboxItem query (ownership-gated single fetch)"
```

---

## Task 4: `POST /api/share` handler + route registration

**Files:**
- Create: `webapp/src/share/shareCapture.ts`
- Modify: `webapp/main.wasp.ts` (route registration + import)

- [ ] **Step 1: Write the handler**

Create `webapp/src/share/shareCapture.ts`:

```ts
import type { Request, Response } from "express";
import { createInboxItemCore } from "../inbox/operationsCore";
import { composeShareText, type ShareFields } from "./composeShareText";

// POST /api/share — the manifest.json share_target action. Receives a
// form-urlencoded body (title / text / url), composes a single capture string,
// saves it via createInboxItemCore (the pure core the Wasp createInboxItem
// action and the CLI cliCapture route both call), and 303-redirects.
//
// Outcomes:
//   logged in, fields present    → save → 303 /share?id=<itemId>
//   logged in, all fields empty  → 303 /share?error=empty
//   logged in, save throws       → log + 303 /share?error=server
//   logged out                   → 303 /login  (user re-shares after sign-in)
//
// `auth: true` on the route resolves context.user from the wasp_session cookie
// the share POST carries (SameSite=lax permits top-level form navigations).
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WaspApiContext = { user?: { id: string }; entities: any };

function extractFields(body: unknown): ShareFields {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  return {
    title: typeof b.title === "string" ? b.title : undefined,
    text: typeof b.text === "string" ? b.text : undefined,
    url: typeof b.url === "string" ? b.url : undefined,
  };
}

export const shareCapture = async (
  req: Request,
  res: Response,
  context: WaspApiContext,
) => {
  // auth:true → context.user is set iff the cookie was present.
  if (!context.user) {
    return res.redirect(303, "/login");
  }

  const text = composeShareText(extractFields(req.body));
  if (!text) return res.redirect(303, "/share?error=empty");

  try {
    const created = await createInboxItemCore(context.entities, {
      userId: context.user.id,
      text,
    });
    return res.redirect(303, `/share?id=${encodeURIComponent(created.id)}`);
  } catch (err) {
    console.error("[share] capture failed:", err);
    return res.redirect(303, "/share?error=server");
  }
};
```

- [ ] **Step 2: Register the route in `main.wasp.ts`**

In `webapp/main.wasp.ts`, add to the existing import for share handlers near the top (or add a new import line if there isn't one for `./src/share/`):

```ts
import { shareCapture } from "./src/share/shareCapture" with { type: "ref" };
import { shareRouteMiddleware } from "./src/share/shareRouteMiddleware" with { type: "ref" };
```

Then, in the `api` routes block (near the `/api/pat/*` and `/api/cli/*` routes — around line 305-340), add:

```ts
    // PWA share_target — form-urlencoded POST from the installed PWA's share
    // sheet (Android/Chrome). auth:true resolves context.user from the
    // wasp_session cookie. See docs/superpowers/specs/2026-07-25-pwa-share-target-design.md.
    api("POST", "/api/share", shareCapture, {
      entities: ["InboxItem", "User", "Lens"],
      auth: true,
      middlewareConfigFn: shareRouteMiddleware,
    }),
```

- [ ] **Step 3: Verify it compiles**

```bash
wasp compile
```
Expected: succeeds.

- [ ] **Step 4: Write the integration test**

Create `webapp/src/share/shareCapture.test.ts`:

```ts
// @vitest-environment node
// Server-op tests run in node: imports pull wasp/server types; jsdom is wrong.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the parser-heavy core? No — we exercise the real composeShareText path
// via the handler. But we DO mock createInboxItemCore so no DB is touched.
vi.mock("../inbox/operationsCore", () => ({
  createInboxItemCore: vi.fn(),
}));

import { shareCapture } from "./shareCapture";
import { createInboxItemCore } from "../inbox/operationsCore";

function makeRes() {
  const res: Record<string, ReturnType<typeof vi.fn>> = {
    redirect: vi.fn(),
  };
  return res as unknown as import("express").Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shareCapture", () => {
  it("redirects to /login when context.user is null", async () => {
    const req = { body: { title: "X", url: "https://x.com" } } as any;
    const res = makeRes();
    await shareCapture(req, res, { user: undefined, entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/login");
    expect(createInboxItemCore).not.toHaveBeenCalled();
  });

  it("redirects to /share?error=empty when all fields blank", async () => {
    const req = { body: { title: "   " } } as any;
    const res = makeRes();
    await shareCapture(req, res, { user: { id: "u1" }, entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?error=empty");
    expect(createInboxItemCore).not.toHaveBeenCalled();
  });

  it("saves composed text and redirects to /share?id= on success", async () => {
    const req = { body: { title: "Cool", url: "https://x.com" } } as any;
    const res = makeRes();
    (createInboxItemCore as any).mockResolvedValue({
      id: "item-1", text: "Cool — https://x.com", createdAt: new Date(),
    });
    await shareCapture(req, res, { user: { id: "u1" }, entities: { E: 1 } });
    expect(createInboxItemCore).toHaveBeenCalledWith({ E: 1 }, {
      userId: "u1",
      text: "Cool — https://x.com",
    });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?id=item-1");
  });

  it("redirects to /share?error=server when core throws", async () => {
    const req = { body: { url: "https://x.com" } } as any;
    const res = makeRes();
    (createInboxItemCore as any).mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await shareCapture(req, res, { user: { id: "u1" }, entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?error=server");
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 5: Run the integration test**

```bash
npx vitest run src/share/shareCapture.test.ts
```
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/share/shareCapture.ts webapp/src/share/shareCapture.test.ts webapp/main.wasp.ts
git commit -m "feat(share): POST /api/share handler + route registration"
```

---

## Task 5: Export `ParsedCaptureChips` for reuse

**Files:**
- Modify: `webapp/src/components/ui/CapturePopover.tsx` (line ~384)

- [ ] **Step 1: Add `export` to the function**

In `webapp/src/components/ui/CapturePopover.tsx`, the line (around 384):

```ts
function ParsedCaptureChips({
```

Change to:

```ts
export function ParsedCaptureChips({
```

- [ ] **Step 2: Verify nothing breaks**

```bash
npx vitest run
```
Expected: all existing tests still pass (the change only widens visibility; no behavior change).

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/ui/CapturePopover.tsx
git commit -m "feat(ui): export ParsedCaptureChips for /share page reuse"
```

---

## Task 6: The `/share` page

**Files:**
- Create: `webapp/src/share/SharePage.tsx`
- Create: `webapp/src/share/SharePage.css`

- [ ] **Step 1: Read the captured-toast CSS + ParsedCapture type for reference**

Open `webapp/src/components/ui/Overlays.css` (around lines 463-524) to see `.aa-capture__captured*` classes and the `aa-capture-slidein` keyframe — the page will reuse these. Also confirm the `ParsedCapture` type is exported from `webapp/src/inbox/parseCapture.ts` (it is, at line 30).

- [ ] **Step 2: Write the page styles**

Create `webapp/src/share/SharePage.css`:

```css
/* Full-screen /share confirmation page. Reuses the captured-toast aesthetic
   (.aa-capture__captured* tokens) but centered as a page, not an overlay.
   Calm: teal checkmark, neutral card, system font, generous whitespace. */

.aa-share {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--aa-space-4, 24px);
  background: var(--aa-bg, #fff);
}

.aa-share__card {
  width: 100%;
  max-width: 420px;
  text-align: center;
  animation: aa-capture-slidein 220ms ease-out;
}

.aa-share__check {
  /* reuses the existing captured-check look */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--aa-teal, #008ac0);
  color: #fff;
  margin-bottom: var(--aa-space-3, 16px);
}

.aa-share__title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--aa-text, #111);
  margin: 0 0 var(--aa-space-2, 8px);
}

.aa-share__text {
  font-size: 0.95rem;
  color: var(--aa-text-muted, #666);
  line-height: 1.4;
  margin: var(--aa-space-2, 8px) auto var(--aa-space-3, 16px);
  max-width: 36ch;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.aa-share__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: var(--aa-space-2, 8px) 0;
}

.aa-share__link {
  display: inline-block;
  margin-top: var(--aa-space-3, 16px);
  font-size: 0.875rem;
  color: var(--aa-teal, #008ac0);
  text-decoration: none;
}

.aa-share__link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 3: Write the page component**

Create `webapp/src/share/SharePage.tsx`:

```tsx
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "wasp/client/operations";
import { getInboxItem } from "../inbox/operations";
import { ParsedCaptureChips } from "../components/ui/CapturePopover";
import type { ParsedCapture } from "../inbox/parseCapture";
import { useQueryClient } from "@tanstack/react-query";
import "./SharePage.css";

// /share — the PWA share_target confirmation page. Three shapes:
//   ?id=<itemId>          → captured (checkmark + parsed chips + text); auto-dismiss ~3s
//   ?error=empty|server   → first-class error state with copy + recovery link
//   (no id / item null)   → "missing" state (treated as ?error=missing)
//
// Auto-dismiss: ~3s after mount (happy path only), invalidate the inbox queries
// (so the sidebar count updates if the user lands in the shell), attempt
// window.close() (works only for script-opened windows), and on failure
// navigate to /do.
//
// NOTE: this page is registered with authRequired:false so it renders during
// session resolution. The happy path requires an authed user (the POST already
// authed them); if the item can't be loaded we show the missing state rather
// than bouncing to /login.

const DISMISS_MS = 3000;
const CLOSE_GRACE_MS = 100;

export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const id = params.get("id");
  const error = params.get("error"); // empty | server | missing | null

  const itemQuery = useQuery(
    getInboxItem,
    { id: id ?? "" },
    { enabled: !!id },
  );

  // Happy-path auto-dismiss.
  useEffect(() => {
    if (!id) return;
    if (itemQuery.isLoading || itemQuery.error || !itemQuery.data) return;

    const timer = setTimeout(() => {
      // Invalidate so the shell's inbox count reflects the new item.
      void queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
      void queryClient.invalidateQueries({ queryKey: ["getAppData"] });

      // Try to close (Android share activity / script-opened windows).
      window.close();

      // If still open after a grace period, land on /do.
      setTimeout(() => {
        if (!window.closed) navigate("/do", { replace: true });
      }, CLOSE_GRACE_MS);
    }, DISMISS_MS);

    return () => clearTimeout(timer);
  }, [id, itemQuery.isLoading, itemQuery.error, itemQuery.data, navigate, queryClient]);

  // Resolve which state to render.
  if (id && itemQuery.isLoading) {
    return renderShell("Capturing…");
  }

  if (id && itemQuery.data) {
    const item = itemQuery.data;
    const parsed: ParsedCapture = {
      parsedLens: item.parsedLens,
      parsedDate: item.parsedDate,
      parsedProject: item.parsedProject,
      parsedPriority: item.parsedPriority,
      parsedSize: item.parsedSize,
      parsedTags: item.parsedTags,
    };
    return (
      <main className="aa-share">
        <div className="aa-share__card">
          <span className="aa-share__check" aria-hidden="true">✓</span>
          <h1 className="aa-share__title">Captured</h1>
          <div className="aa-share__chips">
            <ParsedCaptureChips parsed={parsed} variant="captured" />
          </div>
          <p className="aa-share__text">{item.text}</p>
          <a className="aa-share__link" href="/do">View in inbox</a>
        </div>
      </main>
    );
  }

  // Error states.
  const errorCopy: Record<string, string> = {
    empty: "Nothing to capture.",
    server: "Capture failed — try again.",
    missing: "Couldn't find that capture.",
  };
  const copy = (id && !itemQuery.isLoading && !itemQuery.data)
    ? errorCopy.missing           // id present but item unresolvable → missing
    : errorCopy[error ?? ""] ?? errorCopy.missing;

  return (
    <main className="aa-share">
      <div className="aa-share__card">
        <h1 className="aa-share__title">{copy}</h1>
        <a className="aa-share__link" href="/do">Back to ActionAmp</a>
      </div>
    </main>
  );
}

function renderShell(label: string) {
  return (
    <main className="aa-share">
      <div className="aa-share__card">
        <h1 className="aa-share__title">{label}</h1>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Register the page route in `main.wasp.ts`**

In `webapp/main.wasp.ts`, add the component import (near the other page imports, around line 90-100):

```ts
import { SharePage } from "./src/share/SharePage" with { type: "ref" };
```

Then in the `routes` block (around line 170-210), add a public route (modeled on the `/founding-100` example at line 203):

```ts
    // PWA share_target confirmation page. authRequired:false so it renders
    // during session resolution and after a logged-out → /login bounce (the
    // page handles its own auth awareness). See
    // docs/superpowers/specs/2026-07-25-pwa-share-target-design.md.
    route("ShareRoute", "/share", page(SharePage, { authRequired: false })),
```

- [ ] **Step 5: Verify it compiles**

```bash
wasp compile
```
Expected: succeeds. (If the `ParsedCapture` fields don't match the InboxItem row exactly, fix the mapping in the component — confirm field names against `webapp/schema.prisma`'s `InboxItem` model.)

- [ ] **Step 6: Commit**

```bash
git add webapp/src/share/SharePage.tsx webapp/src/share/SharePage.css webapp/main.wasp.ts
git commit -m "feat(share): /share confirmation page (captured + error states)"
```

---

## Task 7: Add `share_target` to the manifest

**Files:**
- Modify: `webapp/public/manifest.json`

- [ ] **Step 1: Read the current manifest**

Open `webapp/public/manifest.json`. Note the existing top-level keys (`name`, `short_name`, `display`, `start_url`, `scope`, `theme_color`, `icons`, `shortcuts`).

- [ ] **Step 2: Add the `share_target` block**

In `webapp/public/manifest.json`, add a new top-level key (placement doesn't matter; put it after `shortcuts` for locality with other PWA features):

```json
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "application/x-www-form-urlencoded",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
```

- [ ] **Step 3: Validate the JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('webapp/public/manifest.json','utf8')); console.log('OK')"
```
Expected: prints `OK`. (If it errors, fix the trailing comma / bracket.)

- [ ] **Step 4: Commit**

```bash
git add webapp/public/manifest.json
git commit -m "feat(pwa): add share_target to manifest (Android/Chrome)"
```

---

## Task 8: Documentation updates

**Files:**
- Modify: `docs/features/pwa-notifications.md`
- Modify: `docs/ROADMAP.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add "Share target" section to `docs/features/pwa-notifications.md`**

Open `docs/features/pwa-notifications.md`. Append a new section:

```markdown
## Share target (Android/Chrome)

The installed PWA is a share target. Sharing from another app (browser,
Twitter, notes) surfaces ActionAmp in the share sheet; selecting it saves the
shared content to the inbox.

**Flow:**
1. User shares from another app → Android opens the PWA at `/share` with a
   POSTed form (`title` / `text` / `url`).
2. `POST /api/share` composes a single string (`Title — url` precedence) and
   saves it via `createInboxItemCore` — the same core `⌘K` capture and the CLI
   use.
3. The route 303-redirects:
   - logged in, success → `/share?id=<itemId>` (confirmation page)
   - logged in, empty payload → `/share?error=empty`
   - logged in, save fails → `/share?error=server`
   - logged out → `/login` (the share is not preserved; re-share after sign-in)
4. `/share` shows the captured item (parsed chips + text) and auto-dismisses
   in ~3s (closing the window back to the source app on Android, else landing
   on `/do`).

**Wiring:**
- `webapp/public/manifest.json` — the `share_target` block (action `/share`,
  method POST, enctype `application/x-www-form-urlencoded`).
- `webapp/src/share/` — `shareCapture.ts` (route handler),
  `composeShareText.ts` (field composition), `shareRouteMiddleware.ts`
  (urlencoded parsing), `SharePage.tsx` (confirmation page).

**iOS gap:** `share_target` is Android/Chrome only. iOS Safari ignores the
manifest block — the feature simply doesn't appear in the iOS share sheet.
iOS requires a native Share Extension (a post-PMF native-shell concern; see
`docs/ROADMAP.md` Icebox). iOS users continue to use `⌘K` / paste capture.
```

- [ ] **Step 2: Add to `docs/ROADMAP.md` active list**

Open `docs/ROADMAP.md`. Find the active/priority list section and add an entry for this feature (match the surrounding format). Suggested entry:

```markdown
- **PWA share-to-inbox** — installed PWA is an Android/Chrome share target;
  shares save to the inbox via `createInboxItemCore`, with a `/share`
  confirmation page. iOS gap documented (native Share Extension is post-PMF).
  Spec: `docs/superpowers/specs/2026-07-25-pwa-share-target-design.md`.
```

(Place it at the priority the owner has been using for shipped PWA work; if unsure, ask.)

- [ ] **Step 3: Add task-routing row to `AGENTS.md`**

Open `AGENTS.md`. Find the "Task → doc routing" table. Add a row (alphabetical-ish, near the capture/PWA rows):

```markdown
| Share-to-inbox (PWA `share_target`, Android/Chrome) | `docs/features/pwa-notifications.md` (Share target §) + `webapp/src/share/` + `docs/superpowers/specs/2026-07-25-pwa-share-target-design.md` |
```

- [ ] **Step 4: Commit**

```bash
git add docs/features/pwa-notifications.md docs/ROADMAP.md AGENTS.md
git commit -m "docs: share-target feature doc + roadmap + AGENTS routing"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full test suite**

```bash
cd webapp && npm test
```
Expected: all tests pass — the new `composeShareText` + `shareCapture` tests, plus existing tests unaffected.

- [ ] **Step 2: Wasp compile (final)**

```bash
wasp compile
```
Expected: succeeds.

- [ ] **Step 3: Smoke-start the app and exercise the route manually**

Start the dev server (the owner's normal `wasp start` flow). Then, from a terminal, exercise the route with `curl` to confirm the end-to-end wiring before the owner's manual Android QA:

```bash
# Without a cookie (logged out) → expect 303 to /login
curl -i -X POST http://localhost:3001/api/share \
  -d "title=Test&url=https://example.com"

# With a session cookie (substitute a real wasp_session value) → expect 303 to /share?id=...
curl -i -X POST http://localhost:3001/api/share \
  -H "Cookie: wasp_session=<your-dev-session>" \
  -d "title=Test&url=https://example.com"
```

(If port 3001 isn't the local API port, check the running `wasp start` output for the API port.) Expected: the first returns a 303 with `Location: /login`; the second returns a 303 with `Location: /share?id=<some-uuid>`. The owner's manual Android QA validates the actual share-sheet integration.

- [ ] **Step 4: Commit (if any fixups were made)**

If Steps 1-3 surfaced issues that needed edits, commit them with clear messages. Otherwise, no commit.

---

## Self-Review

**1. Spec coverage:**
- §manifest `share_target` → Task 7 ✓
- §`composeShareText` (table + truncation) → Task 1 ✓
- §`POST /api/share` handler (logged in / empty / server / logged out) → Task 4 ✓
- §urlencoded middleware → Task 2 ✓
- §logged-out path (re-share after login, no token) → Task 4 (handler) + Task 6 (page renders without auth) ✓
- §`/share` page states (captured / empty / server / missing) → Task 6 ✓
- §`ParsedCaptureChips` export → Task 5 ✓
- §`getInboxItem` query → Task 3 ✓
- §auto-dismiss (~3s, window.close, fallback navigate) → Task 6 ✓
- §query invalidation → Task 6 ✓
- §error handling table → Tasks 4 + 6 ✓
- §docs (pwa-notifications, ROADMAP, AGENTS) → Task 8 ✓
- §done conditions → covered across tasks; final verification in Task 9 ✓

**2. Placeholder scan:** no TBD/TODO. Step prose is concrete. The one judgment call left to the implementer is ROADMAP placement priority (Task 8 Step 2 says "ask if unsure") — that's a product decision, not a placeholder.

**3. Type consistency:**
- `ShareFields` defined in Task 1, imported in Task 4 (`import { composeShareText, type ShareFields }`) ✓
- `shareCapture(req, res, context)` signature consistent across Task 4 handler + test ✓
- `getInboxItem` registered name matches the Wasp-generated type `GetInboxItem` used in Task 3's `satisfies` ✓
- `ParsedCaptureChips({ parsed, variant })` props match the verified signature in `CapturePopover.tsx:384` ✓
- `getInboxItem` query import in `SharePage.tsx` (Task 6) matches the export added in Task 3 ✓
- Route path `/api/share` consistent across manifest (Task 7), handler (Task 4), and registration (Task 4 Step 2) ✓
- Page path `/share` consistent across manifest `share_target.action`, route registration, and the page component ✓

No gaps, no placeholders, no type drift.
