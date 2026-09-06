-- Remove FOUNDER from the Plan enum (plan dropped from the catalog; never had
-- purchasers). Defensive: remap any stray FOUNDER rows to PRO, then rebuild the
-- enum type without FOUNDER. Postgres has no native DROP VALUE, so we rename
-- the old type, create the new one, and re-point both columns.

UPDATE "User" SET "plan" = 'PRO' WHERE "plan" = 'FOUNDER';
UPDATE "Payment" SET "plan" = 'PRO' WHERE "plan" = 'FOUNDER';

ALTER TABLE "User" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TYPE "Plan" RENAME TO "Plan_old";
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');
ALTER TABLE "User" ALTER COLUMN "plan" TYPE "Plan" USING "plan"::text::"Plan";
ALTER TABLE "Payment" ALTER COLUMN "plan" TYPE "Plan" USING "plan"::text::"Plan";
ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'FREE';
DROP TYPE "Plan_old";
