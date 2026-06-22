/*
  Consolidate User names: single `fullName` (required) + extracted `firstName`
  (already present) + nullable `preferredName` (set during onboarding).

  Backfills `fullName` from existing firstName/lastName so the present dev row
  keeps its data, then drops lastName.
*/
-- Add columns as nullable first so we can backfill existing rows.
ALTER TABLE "User" ADD COLUMN "fullName" TEXT,
ADD COLUMN "preferredName" TEXT;

-- Backfill: existing firstName/lastName are both NOT NULL, so this covers every row.
UPDATE "User" SET "fullName" = "firstName" || ' ' || "lastName";

-- Now lock it down.
ALTER TABLE "User" ALTER COLUMN "fullName" SET NOT NULL;

-- lastName folded into fullName; no longer a separate column.
ALTER TABLE "User" DROP COLUMN "lastName";
