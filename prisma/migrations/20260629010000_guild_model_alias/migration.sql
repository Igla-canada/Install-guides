-- Extra model name(s) a guide answers to (e.g. a RAM "1500" guide is "Ram 1500"
-- under Dodge). Free-text resolution hints; the canonical model stays the FK.
CREATE TABLE "GuildModelAlias" (
  "guildId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "GuildModelAlias_pkey" PRIMARY KEY ("guildId", "name")
);
ALTER TABLE "GuildModelAlias" ADD CONSTRAINT "GuildModelAlias_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Match the project's RLS posture (Prisma connects as owner and bypasses RLS).
ALTER TABLE "GuildModelAlias" ENABLE ROW LEVEL SECURITY;
