-- Optional review cadence preferences. Existing and new users receive all
-- three rhythms; each can be disabled independently in Preferences.
ALTER TABLE "User"
  ADD COLUMN "todayReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "weekReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "monthReviewEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "ReviewCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE "Review" (
  "id" TEXT NOT NULL,
  "cadence" "ReviewCadence" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "timeZone" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "snapshot" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,

  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Review_userId_cadence_periodStart_key"
  ON "Review"("userId", "cadence", "periodStart");
CREATE INDEX "Review_userId_cadence_periodStart_idx"
  ON "Review"("userId", "cadence", "periodStart");

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
