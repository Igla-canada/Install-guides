-- Open-ended year ranges: NULL yearTo means "through current year / ongoing"
-- (mirrors Generation.yearEnd null). Does not alter Guild rows.
ALTER TABLE "VehicleCompatibility" ALTER COLUMN "yearTo" DROP NOT NULL;
