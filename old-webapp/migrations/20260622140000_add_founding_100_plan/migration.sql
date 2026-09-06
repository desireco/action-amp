-- Re-add FOUNDER to the Plan enum as the "Founding 100" tier: one-time $139,
-- lifetime Pro access, capped at 100 spots (enforced server-side at checkout).
-- Adding a value to an enum already in use is safe in Postgres.
ALTER TYPE "Plan" ADD VALUE 'FOUNDER';
