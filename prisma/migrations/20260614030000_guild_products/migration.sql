CREATE TABLE "GuildProduct" (
  "guildId" TEXT NOT NULL,
  "iglaProductId" TEXT NOT NULL,
  CONSTRAINT "GuildProduct_pkey" PRIMARY KEY ("guildId", "iglaProductId")
);
CREATE INDEX "GuildProduct_iglaProductId_idx" ON "GuildProduct" ("iglaProductId");
ALTER TABLE "GuildProduct" ADD CONSTRAINT "GuildProduct_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildProduct" ADD CONSTRAINT "GuildProduct_iglaProductId_fkey"
  FOREIGN KEY ("iglaProductId") REFERENCES "IglaProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Backfill: every existing guide covers its current primary product.
INSERT INTO "GuildProduct" ("guildId", "iglaProductId")
  SELECT "id", "iglaProductId" FROM "Guild"
  ON CONFLICT DO NOTHING;
