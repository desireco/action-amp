/*
  Warnings:

  - Added the required column `updatedAt` to the `Feedback` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- AlterTable
-- `status` defaults to OPEN (correct for all existing untriaged rows).
-- `updatedAt` is required; backfill from createdAt so existing rows have a
-- sensible value, then the column stays current via @updatedAt going forward.
ALTER TABLE "Feedback" ADD COLUMN     "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

UPDATE "Feedback" SET "updatedAt" = "createdAt";
