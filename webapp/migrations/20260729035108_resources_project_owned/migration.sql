/*
  Warnings:

  - You are about to drop the column `goalId` on the `Resource` table. All the data in the column will be lost.
  - Made the column `projectId` on table `Resource` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Resource" DROP CONSTRAINT "Resource_goalId_fkey";

-- AlterTable
ALTER TABLE "Resource" DROP COLUMN "goalId",
ALTER COLUMN "projectId" SET NOT NULL;
