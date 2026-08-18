-- Simple lists move from Lens type to Project type
-- (docs/specs/simple-list-projects.md; WORKFLOW.md §5.13).
--
-- Every SIMPLE_LIST lens becomes a SIMPLE_LIST project in the user's home
-- lens (the included lens, else the earliest lens — the seeded Work/Me pair
-- guarantees one exists). The converted project keeps the lens's id, so the
-- ListItem backfill is a straight lensId → projectId copy. The lens itself,
-- its denormalized references, and the LensType discriminator are removed.

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('STANDARD', 'SIMPLE_LIST');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "type" "ProjectType" NOT NULL DEFAULT 'STANDARD';

-- AlterTable (nullable first; backfilled and tightened below)
ALTER TABLE "ListItem" ADD COLUMN "projectId" TEXT;

-- One SIMPLE_LIST project per SIMPLE_LIST lens. Permalink is the slugified
-- lens name, de-duplicated per user against existing projects with a short
-- lens-id suffix (lens names are unique per user, so lens-vs-lens is safe).
WITH converted AS (
  INSERT INTO "Project" ("id", "name", "permalink", "description", "type", "order", "createdAt", "userId", "lensId")
  SELECT
    l."id",
    l."name",
    CASE
      WHEN EXISTS (
        SELECT 1 FROM "Project" p
        WHERE p."userId" = l."userId"
          AND p."permalink" = COALESCE(NULLIF(lower(btrim(regexp_replace(l."name", '[^a-zA-Z0-9]+', '-', 'g'), '-')), ''), 'list-' || substr(l."id", 1, 8))
      ) THEN COALESCE(NULLIF(lower(btrim(regexp_replace(l."name", '[^a-zA-Z0-9]+', '-', 'g'), '-')), ''), 'list-' || substr(l."id", 1, 8)) || '-' || substr(l."id", 1, 8)
      ELSE COALESCE(NULLIF(lower(btrim(regexp_replace(l."name", '[^a-zA-Z0-9]+', '-', 'g'), '-')), ''), 'list-' || substr(l."id", 1, 8))
    END,
    l."purpose",
    'SIMPLE_LIST',
    0,
    l."createdAt",
    l."userId",
    COALESCE(
      (SELECT h."id" FROM "Lens" h WHERE h."userId" = l."userId" AND h."isIncluded" ORDER BY h."createdAt" LIMIT 1),
      (SELECT h."id" FROM "Lens" h WHERE h."userId" = l."userId" ORDER BY h."createdAt" LIMIT 1)
    )
  FROM "Lens" l
  WHERE l."type" = 'SIMPLE_LIST'
  RETURNING "id"
)
SELECT count(*) FROM converted;

-- List items follow their lens (project id == lens id by construction; any
-- row that somehow pointed at a life-area lens fails the FK below, loudly).
UPDATE "ListItem" SET "projectId" = "lensId";

-- AlterTable
ALTER TABLE "ListItem" ALTER COLUMN "projectId" SET NOT NULL;

-- DropForeignKey (before the lens delete — Lens cascade must not eat items)
ALTER TABLE "ListItem" DROP CONSTRAINT "ListItem_lensId_fkey";

-- DropIndex
DROP INDEX "ListItem_lensId_isDone_order_idx";

-- AlterTable
ALTER TABLE "ListItem" DROP COLUMN "lensId";

-- CreateIndex
CREATE INDEX "ListItem_projectId_isDone_order_idx" ON "ListItem"("projectId", "isDone", "order");

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Denormalized lens references: neutralize hints that pointed at lists
UPDATE "InboxItem" SET "parsedLensId" = NULL, "parsedLens" = NULL
WHERE "parsedLensId" IN (SELECT "id" FROM "Lens" WHERE "type" = 'SIMPLE_LIST');

UPDATE "Feedback" SET "lensId" = NULL
WHERE "lensId" IN (SELECT "id" FROM "Lens" WHERE "type" = 'SIMPLE_LIST');

-- The lenses themselves (their goals/projects/tasks sets are empty by the
-- server-side invariant; anything else fails here loudly)
DELETE FROM "Lens" WHERE "type" = 'SIMPLE_LIST';

-- AlterTable
ALTER TABLE "Lens" DROP COLUMN "type";

-- DropEnum
DROP TYPE "LensType";
