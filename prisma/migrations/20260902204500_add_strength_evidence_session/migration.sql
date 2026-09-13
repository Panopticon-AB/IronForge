-- CreateTable
CREATE TABLE "StrengthEvidenceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "providerSessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "evidenceVersion" INTEGER NOT NULL DEFAULT 1,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrengthEvidenceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StrengthEvidenceSession_userId_source_providerSessionId_key"
ON "StrengthEvidenceSession"("userId", "source", "providerSessionId");

-- CreateIndex
CREATE INDEX "StrengthEvidenceSession_userId_startedAt_idx"
ON "StrengthEvidenceSession"("userId", "startedAt");
