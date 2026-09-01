# web-imba — Imba client notes (spike deliverable)

## The hand-rolled layer: cost vs the Svelte side's freebies

- `src/api.imba` — **62 lines**: auth (sign-up / sign-in / get-session) plus
  a generic `rpc(action, input)` and 5 typed-by-convention wrappers. This is
  what the Svelte client got *for free* from `createRouterClient<Router>`:
  full input/output typing, the oRPC `{"json": …}` envelope, and the
  date-transformer `meta` handling (we just consume ISO strings raw).
- Time split (honest): UI + client logic ≈ 1.5h; **toolchain/syntax
  archaeology ≈ 1.5h+** — six distinct compiler fights, each documented in
  [`imba-cheatsheet.md`](imba-cheatsheet.md): missing `@ivar` sugar in the
  required vite fork, `tag` being a reserved word (twice), no closing tags,
  broken conditional classes, `do`-wrapped handlers, `@bind` vs `bind`.
- The archaeology cost is front-loaded (the cheatsheet now exists), but the
  root cause is structural: `vite-plugin-imba@0.10.3` only works with the
  `vite` dist-tag fork of an **alpha** language, pinned exactly.

## Endpoint discovery without generated types

The api-notes HTTP table (method/path/body) was the contract. Verdict: it
worked, but it is *documentation-maintained* — the moment a Typebase action
changes shape, Imba discovers it at runtime, not at compile time. The
`meta` date array in responses is ignored by this client (dates unused in
UI); a production client would need to handle it.

## What would close the gap

A machine-readable export from Typebase (OpenAPI/JSON Schema) + a small
generator → typed `api.imba`. Not attempted in the timebox (the spike's
day-2-PM probe, if revisited). Cheaper half-measure: a shared `.ts` types
file consumed via JSDoc-ish annotations — partial credit only.

## DX

- Dev loop (once running): vite HMR, instant, nice.
- Tagged templates + implicit reactivity (mutate `link.status`, UI updates)
  genuinely pleasant — optimistic updates were *simpler* than Svelte's
  `$state` map-replace dance (we mutate objects in place).
- But: one-error-at-a-time compiler messages with misleading positions
  (`unmatched }` for a reserved-word collision two tokens away) made the
  loop painful until the cheatsheet existed.
- Honest preference (before live use): Svelte — stable toolchain beats
  nicer mutation semantics at alpha quality. Revisit after Imba 2 final.

## Numbers

| Metric | Value |
|---|---|
| `src/main.imba` | ~250 lines (includes if/else class branches the compiler forces) |
| `src/api.imba` | 62 lines (the measured hand-roll) |
| `src/app.css` | ~280 lines (same stylesheet as Svelte side, by design) |
| Bundle (vite build) | **126.23 kB JS (40.20 gzip)** + 13.01 kB CSS |

## Feature parity checklist (vs spec)

⌘K capture with `#tags` ✓ · status tabs ✓ · j/k/K/D/T keys ✓ · tag chips
filter ✓ · optimistic status + tag with rollback ✓ · tokens.css light/dark ✓
· auth (sign-up/in, session restore) ✓ — all implemented; verified by build
+ API e2e; browser-click-through pending Jake's review pass.
