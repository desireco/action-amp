-- Add Task.updatedAt (Prisma @updatedAt, client-maintained). Added with a
-- temporary DEFAULT so the 89 existing rows backfill to their creation-time
-- stamp, then the default is dropped — the final state matches the schema
-- (no DB-side default; the Prisma client stamps every write).
ALTER TABLE "Task" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Task" ALTER COLUMN "updatedAt" DROP DEFAULT;
