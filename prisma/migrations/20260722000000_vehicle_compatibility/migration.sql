-- Dealer vehicle compatibility list (independent of Guild / guide management).
CREATE TABLE "VehicleCompatibility" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "yearFrom" INTEGER NOT NULL,
    "yearTo" INTEGER NOT NULL,
    "trim" TEXT,
    "engineType" TEXT,
    "transmissionType" TEXT,
    "analogBlockRequired" BOOLEAN NOT NULL DEFAULT false,
    "analogBlockType" TEXT,
    "additionalBlockRequired" BOOLEAN NOT NULL DEFAULT false,
    "additionalBlockDetails" TEXT,
    "installationNotes" TEXT,
    "dealerNotes" TEXT,
    "internalAdminNotes" TEXT,
    "isVisibleToDealers" BOOLEAN NOT NULL DEFAULT true,
    "sourceGuideId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleCompatibility_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VehicleCompatibility_make_model_idx" ON "VehicleCompatibility"("make", "model");
CREATE INDEX "VehicleCompatibility_yearFrom_yearTo_idx" ON "VehicleCompatibility"("yearFrom", "yearTo");
CREATE INDEX "VehicleCompatibility_isVisibleToDealers_idx" ON "VehicleCompatibility"("isVisibleToDealers");
CREATE INDEX "VehicleCompatibility_sourceGuideId_idx" ON "VehicleCompatibility"("sourceGuideId");

-- Match project RLS posture (Prisma connects as owner and bypasses RLS).
ALTER TABLE "VehicleCompatibility" ENABLE ROW LEVEL SECURITY;
