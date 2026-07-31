-- Guide checkbox for analog blocking + optional digital/analog block kind on
-- compatibility rows (manual + synced from guide).

ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "analogBlockingRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "VehicleCompatibility" ADD COLUMN IF NOT EXISTS "blockKind" TEXT;
