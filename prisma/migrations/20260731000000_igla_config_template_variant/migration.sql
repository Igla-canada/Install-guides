-- Allow Current + Old flasher templates per product (same unit type, not a
-- separate product). Existing rows become variant = 'current'.

ALTER TABLE "IglaConfigTemplate" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'current';

DROP INDEX IF EXISTS "IglaConfigTemplate_iglaProductId_key";

CREATE UNIQUE INDEX "IglaConfigTemplate_iglaProductId_variant_key"
  ON "IglaConfigTemplate"("iglaProductId", "variant");

CREATE INDEX "IglaConfigTemplate_iglaProductId_idx"
  ON "IglaConfigTemplate"("iglaProductId");
