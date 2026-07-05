-- CreateTable
CREATE TABLE "TaskSession" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskSession_taskId_startedAt_idx" ON "TaskSession"("taskId", "startedAt");

-- AddForeignKey
ALTER TABLE "TaskSession" ADD CONSTRAINT "TaskSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSession" ADD CONSTRAINT "TaskSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
