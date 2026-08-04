-- "Recommended IGLA Alarm as it enables to use more buttons than IGLA 231".
-- Set per guide (Identity panel) for cars where BOTH units fit and Alarm is the
-- better pick; mirrored onto that guide's VehicleCompatibility rows so the
-- portal and the compatibility list can show the recommendation.
-- Default false = say nothing, so nothing changes until an admin opts a guide in.
ALTER TABLE "Guild" ADD COLUMN "alarmMoreButtons" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VehicleCompatibility" ADD COLUMN "alarmMoreButtons" BOOLEAN NOT NULL DEFAULT false;
