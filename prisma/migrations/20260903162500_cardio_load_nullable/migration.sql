-- Preserve unknown future Intervals training load as NULL.
-- Existing zero values are intentionally left untouched because legacy ingestion
-- conflated missing load with measured zero.
ALTER TABLE "CardioLog" ALTER COLUMN "load" DROP NOT NULL;
