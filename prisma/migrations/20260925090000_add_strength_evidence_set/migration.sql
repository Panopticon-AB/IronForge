-- CreateTable
CREATE TABLE "StrengthEvidenceSet" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientWriteId" TEXT NOT NULL,
    "performedExerciseId" TEXT NOT NULL,
    "exerciseName" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "measurementMode" TEXT NOT NULL,
    "load" DOUBLE PRECISION,
    "loadUnit" TEXT,
    "loadSemantics" TEXT,
    "loadKg" DOUBLE PRECISION,
    "reps" INTEGER,
    "durationSeconds" INTEGER,
    "side" TEXT,
    "rpe" DOUBLE PRECISION,
    "rir" DOUBLE PRECISION,
    "setType" TEXT NOT NULL DEFAULT 'NORMAL',
    "note" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrengthEvidenceSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrengthEvidenceSet_sessionId_performedExerciseId_idx" ON "StrengthEvidenceSet"("sessionId", "performedExerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "StrengthEvidenceSet_sessionId_clientWriteId_key" ON "StrengthEvidenceSet"("sessionId", "clientWriteId");
