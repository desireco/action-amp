-- Preserve the old seeded/entitlement semantics without keeping Personal and
-- Work as Lens categories. Names remain ordinary labels; these booleans only
-- protect defaults and identify the single Lens included with Free.
ALTER TABLE "Lens"
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isIncluded" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Lens"
SET
  "isDefault" = ("kind" IN ('PERSONAL', 'WORK')),
  "isIncluded" = ("kind" = 'PERSONAL');

ALTER TABLE "Lens" DROP COLUMN "kind";
DROP TYPE "LensKind";
