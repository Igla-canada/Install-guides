-- One compatibility row per guide. Lets syncCompatibilityFromGuide() upsert on
-- sourceGuideId (it could previously only updateMany, so a guide with no row
-- stayed off the list forever), and makes duplicate rows for one guide
-- impossible. NULL sourceGuideId (manual coverage) is exempt — Postgres permits
-- many NULLs in a unique index.
--
-- Safe as-is: audited before applying, 0 guides had more than one row.
DROP INDEX IF EXISTS "VehicleCompatibility_sourceGuideId_idx";
CREATE UNIQUE INDEX "VehicleCompatibility_sourceGuideId_key"
  ON "VehicleCompatibility"("sourceGuideId");
