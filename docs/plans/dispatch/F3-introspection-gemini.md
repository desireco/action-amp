# DISPATCH — F3 Drizzle introspection + schema diff report

**TARGET MODEL: Gemini (capable tier) — author; ZCode will audit (capable)**
Goal: F3 · Timebox: 1 day · Repo: action-amp root
Preconditions: F1 landed (apps/api exists) and F2 landed
(`actionamp_staging` restorable). Spec source: goal set §Wave 0, F3.

## Read first

1. `AGENTS.md` — database access section.
2. `webapp/schema.prisma` — the source of truth you are diffing against.
3. `docs/plans/dispatch/notes/F2-notes.md` — how to refresh staging.

## Scope — build exactly this, nothing more

1. Minimal drizzle-kit setup inside `apps/api/` (config + devDependency at
   the workspace root is fine) and run `drizzle-kit pull` against
   **`actionamp_staging`** (refresh it from `actionamp_dev` first if stale).
   Introspection is read-only.
2. Commit the generated schema under `apps/api/db/schema/`.
3. Write **`docs/plans/introspection-report.md`** — the real deliverable:

   * Table-by-table diff of generated schema vs `webapp/schema.prisma`:
     tables, primary keys, foreign keys, indexes, unique constraints,
     enums, defaults, nullability, relations. State coverage explicitly
     ("all N models accounted for").
   * **The defaults audit (headline):** for every column with a default in
     Prisma, determine whether the default lives in the database
     (`information_schema.columns.column_default` — check it via psql, show
     the queries) or only in the Prisma **client** (`uuid()`, `cuid()`,
     `updatedAt` are client-enforced). Produce the list: "values the domain
     layer must supply on insert" — this list protects the real migration
     from silent data corruption.
   * Type mappings to watch: `DateTime` → `timestamp(3)`, enums, JSON
     columns — note every case found.

## Done when

* Report committed with: full diff coverage statement, the verified
  client-side-defaults list (backed by psql query output, pasted in),
  type-mapping notes.
* `git diff` scope: `apps/api/db/` (+ drizzle config), the report, your
  notes file. Nothing else.
* `docs/plans/dispatch/notes/F3-notes.md`: surprises, drizzle-kit
  friction, anything the report couldn't verify.

## Constraints

* Read-only against every database. Never touch `webapp/`, `spikes/`,
  `actionamp_dev` data (reads for comparison are fine).
* Commit prefix `platform(F3):`.
