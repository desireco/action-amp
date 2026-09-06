-- CreateEnum
CREATE TYPE "LensKind" AS ENUM ('PERSONAL', 'WORK', 'CUSTOM');

-- AlterTable
-- `kind` defaults to CUSTOM so genuinely new (user-defined) lenses are tagged
-- correctly without the create op having to pass it. The two seeded lenses are
-- then backfilled by name (the only safe identifier at migration time — the
-- Lens unique is on [userId, name], and seeded lenses are created with these
-- exact names in onboarding/operations.ts).
ALTER TABLE "Lens" ADD COLUMN     "kind" "LensKind" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "purpose" TEXT;

-- Backfill: tag the seeded lenses by their canonical names. Everything else
-- stays CUSTOM. This is what makes the entitlement guard rename-safe: the kind
-- is the stable handle, the name is just the user-facing label.
UPDATE "Lens" SET "kind" = 'WORK'     WHERE "name" = 'Work';
UPDATE "Lens" SET "kind" = 'PERSONAL' WHERE "name" = 'Me';
