-- Admin-managed "Igla settings" master template, one per product (unit type).
-- doc is a JSONB tree (sections -> rows -> control) that mirrors the official
-- Igla configuration software; snapshot into a guide's igla_settings block on
-- add. See src/lib/igla-config.ts.
CREATE TABLE "IglaConfigTemplate" (
    "id" TEXT NOT NULL,
    "iglaProductId" TEXT NOT NULL,
    "doc" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IglaConfigTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IglaConfigTemplate_iglaProductId_key" ON "IglaConfigTemplate"("iglaProductId");

ALTER TABLE "IglaConfigTemplate"
    ADD CONSTRAINT "IglaConfigTemplate_iglaProductId_fkey"
    FOREIGN KEY ("iglaProductId") REFERENCES "IglaProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
