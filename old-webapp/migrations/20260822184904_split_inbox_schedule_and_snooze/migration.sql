-- AlterTable
ALTER TABLE "InboxItem" ADD COLUMN     "parsedScheduledDate" DATE,
ADD COLUMN     "parsedSnoozedUntil" TIMESTAMPTZ(3);
