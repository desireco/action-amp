-- AlterTable
ALTER TABLE "TaskSession" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "plannedMinutes" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "focusSessionMinutes" INTEGER NOT NULL DEFAULT 25;
