-- Rituals: guidance + benefit (added 2026-09-19) — two optional definition
-- fields: guidance (what to do) and benefit (what you get), shown quietly on
-- the Planning page. Additive ALTERs only; verified against actionamp_dev
-- (drizzle-kit push reports no changes after applying).
ALTER TABLE "Ritual" ADD COLUMN "guidance" text;--> statement-breakpoint
ALTER TABLE "Ritual" ADD COLUMN "benefit" text;
