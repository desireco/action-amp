# Imba syntax cheatsheet — verified against the spike's installed build

> Working reference for the link-garden Imba client. Sources: the README
> shipped in `node_modules/imba` (this exact build) + compile probes via
> `imbac` + build outcomes. **Update this file with every new discovery.**
> Build: imba@2.0.0-alpha-vite.230.3 (dist-tag `vite`) + vite-plugin-imba@0.10.3
> + vite 6 — the ONLY combination that installs, loads, and compiles.

## Toolchain facts (verified)

- `imba` latest is `2.0.0-alpha.253`, but `vite-plugin-imba@0.10.3` imports
  `parseAsset` from `imba/compiler`, which ONLY exists in the `vite`
  dist-tag build (`2.0.0-alpha-vite.230.3`). Pin exactly. Mixing versions =
  `does not provide an export named 'parseAsset'`.
- `imba/vite` is NOT an export of the imba package. The plugin is the
  separate `vite-plugin-imba` package, **named** export `{ imba }` (no
  default export).
- `imbac <file>` compiles a single file (no `compile` subcommand); it prints
  one terse error like `file:LINE:COL: Unexpected 'X'` — one error at a
  time, so expect whack-a-mole.
- The language/tooling is openly alpha ("still in alpha" — README).

## Canonical idioms (from this build's README — trust these first)

```imba
tag login-form < form          # inheritance: `tag x < parent` on the tag line
	<self @submit.prevent=api.login(name,secret)>   # handler = DIRECT CALL, no do()
		<input.username type='text' bind=name>       # binding = bind=name, NOT @bind=
		<button> "Login as {name}"
```

- **Event handlers**: `@click=someMethod` (bare ref) or `@click=fn(arg,x)`
  (direct call — the compiler wraps it; using `do fn(arg)` BREAKS the parse
  when combined with class dots: `<button.active @click=do f(x)>` →
  `Unexpected 'VALUE_END'`).
- **Two-way binding**: `bind=expr` (not `@bind=`).
- **Markup may live directly in the tag body** (implicit render); `def render`
  with `<self>` also works (probe-verified).
- **Interpolation**: `"text {expr}"` and `"##{t}"` (renders `#` + t).
- Inline styles via `<tag[pos:abs d:grid]>`; scoped `css` blocks inside tags;
  `global css` for the rest; `is-{expr}` prefix-classes for dynamic
  `is-<value>` class names.

## Verified by probe (this build)

| Form | Result |
|---|---|
| `def greet` + `return 1` | ✓ |
| `let s = "hi"` in method | ✓ |
| `self.name = "w"` + `return self.name` | ✓ |
| `@name = "w"` (ivar sugar, write) | ✗ `Unexpected '='` |
| reading `@name` anywhere | ✗ |
| `<div.a={true}>` conditional class | ✗ |
| if/else branches in markup | ✓ |
| string interpolation `"{expr}"` | ✓ |
| `do |x| ...` lambdas, `.filter/.map/.find` | ✓ |
| `for x, i in list` / `for ... else` | ✓ |
| bare string children, nested tags by indent | ✓ |
| `def setup` / `def mount` lifecycle | ✓ (bodies use `self.x`) |

## Reserved-word traps (cost real debugging time)

- **`tag` is a keyword** — cannot be used as a variable, loop var, or
  parameter name (`for tag in ...`, `def filterTag tag` both explode with
  misleading errors like `unmatched }` / `Unexpected 'TAG'`). Rename to `t`.
- `setup`/`mount` are fine as method names.

## Rules we code by in this spike (all learned the hard way)

1. State: `self.x` everywhere — never `@x`.
2. Handlers: `@click=method` or `@click=method(arg)` — never `do`, never
   parenthesized assignments.
3. Bindings: `bind=self.field`.
4. Conditional classes: if/else branches duplicating the element — the
   `={expr}` form does not compile.
5. No closing tags, ever — indentation closes everything.
6. No `tag` identifiers; no `@ivar` sugar; no `.class={...}`.
7. Local `let`/`const` in methods is fine; `var` usable too.
8. Errors surface one at a time — fix, rebuild, repeat.

## Open questions (verify when hit)

- ~~`bind=self.field` vs bare~~ — **verified: `bind=self.field` works** (6
  sites compiled and built).
- Custom child tags + event bubbling — untested; avoid for now.
- `get shown` getter — compiled in the successful full build ✓.

## Build result (first green build, 2026-09-01)

`vite build` → 8 modules, `126.26 kB` JS (40.20 gzip) + `13.01 kB` CSS.
The two fixes that unlocked it after the `do`-handler era: direct-call
handlers (`@click=fn(arg)`) and `bind=` (not `@bind=`).

## Reconciler orphans children on branch swap (root cause of the "ugly login")

Repro: load with a session → first paint shows the correct auth view (user
still null), then `self.user` resolves → re-render swaps `<self.auth>` for
`<self.app>` and the reconciler **leaves the old branch's children in the
DOM, stripped of their wrapper** — both views visible, styles gone. (It
also fooled DOM metrics: `.auth` count reads 0 while the orphaned children
still render.)

**Workaround (verified): never swap structure.** Render both subtrees once
inside stable sibling divs and toggle via inline style fed by getters:

```imba
get appDisplay
	if self.user then 'block' else 'none'

def render
	<self>
		<div.app style="display:{self.appDisplay}">
			…
		<div.auth style="display:{self.authDisplay}">
			…
```

Plain-value interpolation in attributes works; attribute structure never
changes, so the broken swap path is never exercised. CSS: custom elements
are inline by default — give the root `link-garden { display: block }`.

Minor casualty that remains: the `for … else` empty-state message does not
render when the list is empty.

## HMR accumulates stale state (2026-09-01, confirmed)

After a session of hot edits, the dev server's module graph goes stale:
both if/else branches render at once, styles drop, reload does NOT fix it —
only restarting `bun run dev` does (then hard-reload the tab). Refined rule:
weird after a small edit → reload the tab; weird after many edits → restart
the dev server.

## Runtime renderer bug (final finding, reproducible)

Even with everything compiling: on a clean reload the app renders the top
of the tree (header, meta) but **silently drops deeper subtrees** — capture
hint, tabs nav, list — with **zero console errors**. Bisected: not the
conditionals (unconditional buttons also vanish), not the form element
(removing it changes nothing), not HMR (reproduces after hard reload).
Trivial probe files render fine; real trees don't. Conclusion: the
`vite-plugin-imba` + `alpha-vite` fork combination is **not production-viable
today** — compile-clean ≠ render-correct. (Browser-verified 2026-09-01;
also: bare `self.method` statements are value references, not calls —
`self.boot()` with parens is required, and `?./or` inside string
interpolation renders empty.)
