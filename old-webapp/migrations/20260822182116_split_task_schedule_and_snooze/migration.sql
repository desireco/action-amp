-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "scheduledDate" DATE,
ADD COLUMN     "snoozedUntil" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timeZone" TEXT;

-- CreateIndex
CREATE INDEX "Task_userId_scheduledDate_idx" ON "Task"("userId", "scheduledDate");

-- CreateIndex
CREATE INDEX "Task_userId_snoozedUntil_idx" ON "Task"("userId", "snoozedUntil");
