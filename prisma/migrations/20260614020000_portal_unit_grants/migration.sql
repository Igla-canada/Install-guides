ALTER TABLE "AccessGrant" ALTER COLUMN "granteePhone" DROP NOT NULL;
ALTER TABLE "AccessGrant" ADD COLUMN "granteeUnit" TEXT;
ALTER TABLE "AccessGrant" ADD COLUMN "directOpen" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "AccessGrant_granteeUnit_idx" ON "AccessGrant" ("granteeUnit");
