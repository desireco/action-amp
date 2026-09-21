/**
 * Applies pending SQL migrations from packages/domain/drizzle/*.sql.
 *
 * The drizzle journal only tracks introspection-generated files, so the
 * hand-written migrations (the durable staging/prod record) are invisible to
 * `drizzle-kit migrate` — and the deployed image has no drizzle-kit anyway.
 * This runner is the production migration story: bookkeeping in
 * public._schema_migrations, one transaction per file (apply + record are
 * atomic), statements split on drizzle's `--> statement-breakpoint` marker.
 *
 * Wired as the Railway preDeployCommand (railway.json) so a deploy whose
 * schema is behind fails closed instead of shipping code the database can't
 * serve — the 2026-09-20 incident: rituals code against a prod schema
 * without the Ritual table, every boot appData 500'd, and the app looked
 * erased. Also runnable by hand: DATABASE_URL=... bun api/src/migrate.ts.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";

const migrationsDir = join(
  import.meta.dir,
  "..",
  "..",
  "packages",
  "domain",
  "drizzle",
);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

// Block comments go first, from the whole file: 0000's markers live inside
// its uncomment-to-run comment block, and splitting before stripping would
// cut the comment into unterminated fragments. What survives stripping is
// then chunked on drizzle's marker.
function statements(raw: string): string[] {
  const withoutBlocks = raw.replace(/\/\*[\s\S]*?\*\//g, " ");
  return withoutBlocks
    .split("--> statement-breakpoint")
    .flatMap((chunk) => chunk.split(/;\s*(?=\n|$)/))
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.length > 0);
}

const sql = new SQL(databaseUrl);
try {
  await sql`CREATE TABLE IF NOT EXISTS public._schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const appliedRows = (await sql`SELECT name FROM public._schema_migrations`) as Array<{
    name: string;
  }>;
  const applied = new Set(appliedRows.map((row) => row.name));

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const raw = await Bun.file(join(migrationsDir, file)).text();
    const batch = statements(raw);
    await sql.begin(async (tx) => {
      for (const statement of batch) await tx.unsafe(statement);
      await tx`INSERT INTO public._schema_migrations (name) VALUES (${file})`;
    });
    console.log(`migrate: applied ${file} (${batch.length} statement(s))`);
    count += 1;
  }
  console.log(
    count === 0 ? "migrate: up to date" : `migrate: applied ${count} file(s)`,
  );
} finally {
  await sql.end();
}
