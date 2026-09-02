# S15 — Public / landing / Founding 100 (parity notes)

> P0 pre-study for the platform switch. Source of truth read: `webapp/src/public/`
> (`Founding100Page.tsx` (+css), `Founding100WelcomePage.tsx`, `RedirectToMarketing.tsx`),
> `webapp/src/shared/PublicLayout.tsx`, `webapp/src/billing/operations.ts`
> (`getFounding100Status`, `founding100StatusHandler`) + `statusMiddleware.ts`,
> `webapp/main.wasp.ts`, the Astro marketing site `site/` (pages, layouts,
> components, content), `docs/PUBLIC-PAGES.md` (DRAFT v2 + 2026-07-06 hosting
> reversal), `docs/MARKETING.md` §5, `docs/features/newsletter.md`,
> `docs/features/landing.md`. Note: `webapp/src/landing/` **no longer exists** —
> the landing page moved to the Astro site in the marketing split. These notes are
> the checklist the port is verified against.

## 1. Surface inventory (two deployables)

**Subdomain split (decided 2026-07-06):**
- `actionamp.com` → **Astro static SSG on Cloudflare Pages** (`site/`, project
  `actionamp-site`, direct-upload deploys via `npm run deploy`, not git-connected).
- `app.actionamp.com` → the Wasp SPA (this slice's React pages).
- `api.actionamp.com` → the Wasp server (the one public endpoint + analytics).

### 1a. Wasp-side routes (must exist on the new stack)

| Route | Page | Auth | Notes |
|---|---|---|---|
| `/` (LandingRoute) | `RedirectToMarketing` | false | Client-side redirect to `https://actionamp.com`; on `localhost/127.0.0.1/::1` → `/login`. Exists because App.tsx sends unauthenticated users to `/`. |
| `/founding-100` (Founding100Route) | `Founding100Page` | **false** | Public offer page. The CTA handles auth: anonymous → `/login?returnTo=%2Ffounding-100`; authed → Stripe Checkout. Server op gates on `context.user` (client guard is UX, not security). |
| `/founding-100/welcome` (Founding100WelcomeRoute) | `Founding100WelcomePage` | **true** | Stripe Checkout `success_url`. |
| `/design-system` | DesignSystemPage | false | Internal design reference page (minor; port cheaply or drop consciously). |
| `/login`, `/signup` | PasswordlessAuthPage (email auth surface) | false | Auth slice's surface; listed because every public CTA targets them. |
| `/welcome` | OnboardingPage | true | S13. |

### 1b. Astro site routes (static, `site/src/pages/`)

`/` (landing), `/about`, `/privacy`, `/terms`, `/roadmap`, `/pricing`,
`/blog` + `/blog/[slug]` (11 markdown posts + `featured.config.ts`),
`/guides` + `/guides/[slug]` (13 markdown guides), `/rss.xml`, `/sitemap.xml`,
`/robots.txt`, `llms.txt`, `og/` (og images), favicons. Content collections via
`content.config.ts` (glob loader, Astro 7 API). `astro.config.mjs`:
`site: https://actionamp.com`, `output: "static"`, sitemap integration,
`trailingSlash: "ignore"`, devToolbar disabled.

## 2. Operations / endpoints

| Op / endpoint | Kind | Contract |
|---|---|---|
| `getFounding100Status` | query, **`auth: false`** | `{ cap: 100, reserved: 2, claimed, remaining: max(0, 98 − claimed), isFull: claimed ≥ 98 }` — counts `User` rows matching the founder-membership where-clause. PII-free global counts only. |
| `GET /founding-100/status` | api route, `auth: false` + `publicStatusMiddleware` | Same JSON payload; `Cache-Control: public, max-age=60`; **CORS widened for exactly `https://actionamp.com`** (allow GET+OPTIONS, `Vary: Origin`, expose Cache-Control). Wasp's global CORS only allows the app origin — without this middleware the Astro site can't read it. This endpoint is Astro's **only** coupling to the DB. |
| `createCheckoutSession({ priceKey: "founder" })` | action (auth) | Stripe Checkout; full billing contract is the billing slice's (S-billing) — here it's the offer's money path. |
| `POST /api/analytics/event` | api route, `auth: false` | The Astro `FunnelTracker` posts funnel events here (`${PUBLIC_API_URL}/api/analytics/event`), visitor id in localStorage `actionamp.analytics.visitor`. Analytics slice owns the handler. |

Founding-100 copy numbers (load-bearing, marketing-approved): $99 once;
regular Pro $79.50/yr; "$19.50 more than year one, breaks even after ~15 months";
**100 cap = 98 public + 2 reserved for launch partners**; when full the tier retires
permanently. Tone: patronage, not FOMO — honest cap, no countdowns.

## 3. Behaviors + data flows

### 3.1 `/founding-100` (Founding100Page)
- Live spots-remaining from `useQuery(getFounding100Status)`; while undefined shows
  the static fallback "98 public memberships available…".
- CTA state machine: default "Secure Your Lifetime Spot for $99" → anonymous:
  "Log in to Claim Your Spot" (→ `/login?returnTo=%2Ffounding-100`, preserving
  intent through code entry + magic-link return) → full: "All 100 spots claimed"
  (disabled) → already founder (`user.plan === "FOUNDER"`): "You're a Founding
  Member" (disabled). Errors render inline; `trackStatCounterEvent("checkout_started",
  "founding", "founder")` before redirecting to Stripe.
- Escapes: "Start with Free instead" → `/signup`.

### 3.2 `/founding-100/welcome` (post-checkout)
- Polls `useAuth().refetch` every **2s** for up to **45s** until `user.plan ===
  "FOUNDER"` (the Stripe webhook is the source of truth; the poll just reflects it).
- Three states, no faking: **Finalizing** (polling) → **Congratulations** ("member
  #N of 100", N = `status.claimed`) → **StillConfirming** on timeout (says the
  webhook hasn't landed, points at contact). Auth required (a founder must be
  logged in to have paid).

### 3.3 Astro landing (`site/src/pages/index.astro`)
- Hero "One task. The next one that matters." + CTA **Make an account** →
  `${appUrl}/signup` (absolute, from `PUBLIC_APP_URL`); animated Next-card mock
  cycling hero tasks; final CTA → `/signup`.
- **Founding 100 teaser section**: `hidden` by default; inline script fetches
  `${PUBLIC_API_URL}/founding-100/status` and reveals it **only on success** (fetch
  fail → stays hidden, page still works); fills the live count; CTA →
  `${appUrl}/founding-100`; links to `/pricing` + `/roadmap`.
- SEO (`layouts/PublicLayout.astro`): per-page `title` + `meta description`,
  canonical URL against `site` (https://actionamp.com), full OG set (og:title/
  description/url/type/site_name/image 1200×630 PNG + alt), `twitter:card`
  (`summary_large_image` for articles else `summary`), RSS `<link rel=alternate>`.
  `robots.txt` allows all + points at the canonical sitemap; sitemap + RSS are
  generated routes.
- Analytics: `StatCounter.astro` (prod only — `import.meta.env.PROD`; project
  13339807) + `FunnelTracker.astro` → the public analytics endpoint.
- Styles: `site/src/styles/tokens.css` is **copied from** `webapp/src/styles/tokens.css`
  (the webapp file is source of truth — keep the copy in sync on token changes).
- **No newsletter anywhere** — `docs/features/newsletter.md` status `missing`;
  PRODUCT/ROADMAP prose claiming it's live overclaims. Only CTAs: signup +
  Founding 100. (No `/waitlist` either — removed by principle.)

### 3.4 Public → app handoff (PUBLIC-PAGES.md §6)
```
actionamp.com (Astro)  ──CTA──▶ app.actionamp.com/signup → auth → /welcome (first run) → /do
teaser ──▶ app.actionamp.com/founding-100 → (/login if logged out) → Stripe
         → app.actionamp.com/founding-100/welcome → /do
```
`onAuthSucceededRedirectTo: "/do"`; the S13 gate intercepts first arrival.

## 4. Env vars / keys (names only)

- **Astro (build-time, baked into the static HTML — dashboard env vars don't apply):**
  `PUBLIC_APP_URL` (prod `https://app.actionamp.com`; dev `http://localhost:4000`),
  `PUBLIC_API_URL` (prod `https://api.actionamp.com`; dev `http://localhost:3001`),
  plus the Cloudflare deploy auth (`CLOUDFLARE_API_TOKEN` at repo root / `wrangler login`).
- **Wasp side:** nothing slice-specific — `WASP_WEB_CLIENT_URL`, Stripe keys, and
  the analytics env are owned by their slices. The CORS allow-list for the status
  endpoint hardcodes `https://actionamp.com` (a config value to carry over, not an env).

## 5. Edge cases

- The status endpoint's CORS list is **exactly** one origin; a new marketing origin
  (or localhost dev against prod) gets no CORS headers → the teaser stays hidden.
  Cache-Control 60s means `remaining` can lag a sale by a minute (acceptable; the
  checkout itself re-checks server-side).
- `isFull` is computed against the **public** cap (98), not the nominal 100 — two
  spots are launch-partner-reserved.
- Founding100Welcome can time out with the webhook still pending — the page must
  not fake success; the webhook will catch up and a revisit shows the right state.
- RedirectToMarketing must special-case localhost (dev `/` → `/login`, not the
  marketing site).
- Astro env vars are bake-time: rotating `PUBLIC_API_URL` requires a rebuild+redeploy
  of the site, not just the app.
- Roadmap page (`/roadmap`) is content on Astro; per repo rules it must not grow
  admin-only entries (existing history may remain).

## 6. Tests pinning behavior

No e2e spec targets these pages directly (the money path is exercised manually /
via billing tests). `getFounding100Status` math and the status handler's payload
are the machine-checkable core — port them with unit tests (cap/reserved/remaining/
isFull boundaries at claimed = 97/98/99). The Astro site has no test suite; visual
QA via `astro dev --background` + screenshots.

## 7. Parity bar

**Switch-day (100%):** the Wasp-side money path — `/founding-100` (public offer +
CTA state machine + checkout), `/founding-100/welcome` (webhook-truth polling),
`GET /founding-100/status` (exact payload + 60s cache + actionamp.com CORS),
`/` → marketing redirect, and the `/login`-`/signup` targets they hand off to.
**Zero port needed:** the Astro site itself — it's a separate deployable that talks
to the app over two public URLs; it keeps working unchanged as long as (a) the
status endpoint + analytics endpoint stay up at `PUBLIC_API_URL` with the same
shapes, and (b) `PUBLIC_APP_URL` routes still exist (signup/login/founding-100/do).
If the switch changes hostnames, only the Astro build-time vars + the hardcoded
CORS origin change. **Long-tail:** `/design-system` page (internal), blog/guides
content (pure static, no risk), llms.txt/og assets. **Explicitly absent (don't
build):** newsletter capture, `/waitlist`, publicly advertised prepaid plan.
