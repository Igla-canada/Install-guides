-- Guide search index for the MCP server's retrieval tools.
--
-- Purely additive: creates one new table. No existing table, column or row is
-- touched. The table is a rebuildable mirror of guide content (like
-- VehicleCompatibility) — dropping and repopulating it loses nothing.

CREATE TABLE "GuideSearchDoc" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sectionId" TEXT,
    "sectionOrder" INTEGER NOT NULL DEFAULT 0,
    "guideTitle" TEXT NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generation" TEXT NOT NULL,
    "years" TEXT NOT NULL,
    "trim" TEXT,
    "product" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "aliases" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideSearchDoc_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GuideSearchDoc_guildId_idx" ON "GuideSearchDoc"("guildId");
CREATE INDEX "GuideSearchDoc_status_idx" ON "GuideSearchDoc"("status");

ALTER TABLE "GuideSearchDoc"
  ADD CONSTRAINT "GuideSearchDoc_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The ranking vector, GENERATED so Postgres maintains it and it can never drift
-- from the row it describes.
--
-- Weights are the whole point: vehicle identity (A) outranks the section/guide
-- title (B), which outranks the body (C). A search for "RAM 1500 CAN bus" then
-- puts the RAM guide's own sections above a guide that merely mentions a RAM in
-- passing.
ALTER TABLE "GuideSearchDoc" ADD COLUMN "search" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english',
      coalesce("make", '') || ' ' || coalesce("model", '') || ' ' ||
      coalesce("aliases", '') || ' ' || coalesce("years", '')), 'A') ||
    setweight(to_tsvector('english',
      coalesce("guideTitle", '') || ' ' || coalesce("sectionTitle", '') || ' ' ||
      coalesce("product", '') || ' ' || coalesce("generation", '') || ' ' ||
      coalesce("trim", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("body", '')), 'C')
  ) STORED;

CREATE INDEX "GuideSearchDoc_search_idx" ON "GuideSearchDoc" USING GIN ("search");
