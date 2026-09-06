-- AlterEnum
ALTER TYPE "InboxItemStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "InboxItem" ADD COLUMN     "archivedAt" TIMESTAMP(3);
