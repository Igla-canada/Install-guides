-- IGLA product coverage + guide publish snapshot on compatibility records.
-- Additive only — does not alter Guild / guide rows.
ALTER TABLE "VehicleCompatibility" ADD COLUMN "iglaProducts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "VehicleCompatibility" ADD COLUMN "sourceGuideStatus" TEXT;
