-- AlterTable
ALTER TABLE "StrengthEvidenceSession"
ADD COLUMN "effectState" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "effectsAppliedAt" TIMESTAMP(3);
