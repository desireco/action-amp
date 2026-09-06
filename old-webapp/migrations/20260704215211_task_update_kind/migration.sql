/*
  Warnings:

  - Added the required column `userId` to the `TaskUpdate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TaskUpdateKind" AS ENUM ('NOTE', 'COMPLETED');

-- AlterTable
ALTER TABLE "TaskUpdate" ADD COLUMN     "kind" "TaskUpdateKind" NOT NULL DEFAULT 'NOTE',
ADD COLUMN     "userId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
