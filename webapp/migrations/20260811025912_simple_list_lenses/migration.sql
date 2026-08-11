-- CreateEnum
CREATE TYPE "LensType" AS ENUM ('LIFE_AREA', 'SIMPLE_LIST');

-- AlterTable
ALTER TABLE "Lens" ADD COLUMN     "type" "LensType" NOT NULL DEFAULT 'LIFE_AREA';

-- CreateTable
CREATE TABLE "ListItem" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "lensId" TEXT NOT NULL,

    CONSTRAINT "ListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListItem_lensId_isDone_order_idx" ON "ListItem"("lensId", "isDone", "order");

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_lensId_fkey" FOREIGN KEY ("lensId") REFERENCES "Lens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
