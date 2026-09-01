# Link Garden API spike notes

## Headline finding

Typebase can run as a standalone Bun service without a frontend host. The
Typebase CLI generated a Bun HTTP server directly from `api/typebase/`; the
small wrapper in `api/package.json` regenerates that server and starts it with
`bun`. This is a natural enough `apps/api` shape for the spike, though it is a
generated-server workflow rather than an always-on Typebase dev runtime.

Run locally:

```sh
cd spikes/link-garden/api
cp .env.example .env # then set a real secret
bun install
bunx typebase-io-cli db local push --url "$DATABASE_URL"
PORT=8080 bun run start
```

The server listens on `PORT` (default `8080`), serves better-auth below
`/api/auth`, and its Typebase RPC handler below `/rpc`.

## Schema and auth

`typebase/auth.ts` configures better-auth email/password credentials. Running
`typebase-io-cli init --with-auth` generated the required `users`, `sessions`,
`accounts`, and `verifications` tables. The Link Garden schema adds `links`,
`tags`, and `link_tags`; PostgreSQL enforces the `(user_id, name)` tag
uniqueness and the join table's composite primary key.

The first local start warned that better-auth could not infer a base URL. It
does not block credential/session requests, but any browser deployment must set
`BETTER_AUTH_URL` to the public API URL and extend `trustedOrigins` in
`typebase/auth.ts` for each frontend origin.

Every application action uses the shared `authedAction` middleware. It obtains
the better-auth session from request cookies and scopes reads/writes to
`user.id`; an ID belonging to another user returns `404` rather than exposing
the row.

## Raw HTTP contract for the Imba client

All action calls are `POST` JSON to `http://<host>/rpc/<module>/<export>`. The
oRPC JSON transport wraps inputs as `{"json": <input>}` and returns its result
inside a `json` property. Date values are serialized as ISO strings, with a
small `meta` property used by oRPC's date transformer.

| Purpose | Method and path | Request body |
| --- | --- | --- |
| Sign up | `POST /api/auth/sign-up/email` | `{"name","email","password"}` |
| Sign in | `POST /api/auth/sign-in/email` | `{"email","password"}` |
| Session | `GET /api/auth/get-session` | cookie only |
| Create link | `POST /rpc/links/create` | `{"json":{"url","tags":["tag"]}}` |
| List links | `POST /rpc/links/list` | `{"json":{"status?":"NEW|KEPT|DISMISSED","tag?":"tag"}}` |
| Set status | `POST /rpc/links/setStatus` | `{"json":{"id","status":"NEW|KEPT|DISMISSED"}}` |
| Add tag | `POST /rpc/links/addTag` | `{"json":{"id","name":"tag"}}` |
| Today stats | `POST /rpc/stats/today` | `{"json":{}}` |

`links.create` fetches an HTTP(S) page on the server and extracts its HTML
`<title>`; timeout, non-HTML, invalid response, or missing title falls back to
the supplied URL. `links.setStatus` sets `keptAt` only for `KEPT`.

## Local Bun smoke transcript

Against the local, isolated `link_garden_api` database:

```text
POST /api/auth/sign-up/email                         200
POST /rpc/links/create                               200  title="Example Domain", status="NEW"
POST /rpc/links/addTag                               200  tags=["reading","reference"]
POST /rpc/links/list { tag: "reference" }           200  keeps both tags in the returned link
POST /rpc/links/setStatus { status: "KEPT" }         200  keptAt populated
POST /rpc/stats/today                                200  { captured: 1, kept: 1 }
second user's POST /rpc/links/setStatus(first ID)     404
second user's POST /rpc/links/list                   200  []
```

## Deployment

Railway deployment and a Railway Postgres were intentionally not attempted:
Jake redirected this dispatch to focus on the local API. If deployment resumes,
create a new scratch Railway project/service and Postgres only for this spike;
do not attach either to an ActionAmp service or database. Set `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the frontend origin before running
the Bun start command.

## Notes for the frontend clients (from review)

* Dev ports are **pinned**: SvelteKit on `localhost:5173`, Imba on
  `localhost:3000`. The API's auth trusts exactly those two origins.
* Different localhost ports are the same **site**, so `SameSite=Lax` session
  cookies flow between client and API. If `/rpc` calls still hit CORS
  credentials errors, suspect the generated CORSPlugin's credentials option,
  not better-auth.
* The server is started with `bun run start` from `spikes/link-garden/api/`
  (regenerates + boots; default port 8080).

* **Input validation failures map to 500s.** A zod-rejected input (e.g.
  `url: "hello"`) surfaces as `INTERNAL_SERVER_ERROR` / "Internal server
  error" from the generated server — not a 4xx validation response. The
  clients now pre-validate; the server stays the real gate, but its error
  semantics are lossy at 0.1.15 (finding for F7).

## Review verdict (Zcode review, 2026-09-01)

```text
REVIEW: spike D1-api · author Codex/capable · reviewer ZCode (Z.AI)/capable
verdict: pass-after-fixes
notes: deploy done-condition waived by Jake — local-only spike. Fixes applied
by reviewer: SSRF blocklist in titleFromUrl, deterministic tag ordering in
links.list. Auth kept static (see finding below).
```

Reviewer findings that became spike learnings:

* **Typebase codegen statically extracts auth config.** An env-driven
  `trustedOrigins` array is silently dropped from the generated server
  (codegen warns, runtime ends up with no origins). At 0.1.15 auth config
  must be static literals — a real constraint for multi-environment use of
  the generated-server workflow.
* `titleFromUrl` now carries a spike-grade SSRF blocklist (loopback/private
  ranges). The pattern — server-side fetch of user-supplied URLs — must not
  reach production without real egress controls.
