/**
 * Database wiring for the API app (F8b).
 *
 * The URL comes from `DATABASE_URL` in the real environment. Bun auto-loads
 * `.env` / `.env.local` from the process cwd only — so `bun src/index.ts` run
 * from `api/` reads `api/.env*` (a Wasp-style `.env.server` is NOT
 * picked up). No default value: pointing at a database by accident is worse
 * than failing to start.
 */

/** The local dev identity the seed script manages (real auth is F10). */
export const SEED_DEV_EMAIL = "dev@local.test";

export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw || raw.trim() === "") {
    throw new Error(
      "DATABASE_URL is not set — the API refuses to guess a database. " +
        "Set it to the local dev Postgres (e.g. postgres://jake@localhost:5432/actionamp_dev).",
    );
  }
  return raw;
}

/** Hostname check for the seed guard: only ever touch a local database. */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
