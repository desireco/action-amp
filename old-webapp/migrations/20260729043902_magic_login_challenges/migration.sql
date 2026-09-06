-- CreateTable
CREATE TABLE "MagicLoginChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MagicLoginChallenge_tokenHash_key" ON "MagicLoginChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLoginChallenge_email_createdAt_idx" ON "MagicLoginChallenge"("email", "createdAt");

-- CreateIndex
CREATE INDEX "MagicLoginChallenge_expiresAt_idx" ON "MagicLoginChallenge"("expiresAt");
