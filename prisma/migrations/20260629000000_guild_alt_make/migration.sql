-- A guide's secondary make(s): the guide is ALSO valid for this make (e.g. a
-- RAM 1500 guide bridged to "Dodge"). Per-guide, so it can't mis-route an
-- unrelated model under the same make.
CREATE TABLE "GuildMake" (
  "guildId" TEXT NOT NULL,
  "makeId" TEXT NOT NULL,
  CONSTRAINT "GuildMake_pkey" PRIMARY KEY ("guildId", "makeId")
);
CREATE INDEX "GuildMake_makeId_idx" ON "GuildMake" ("makeId");
ALTER TABLE "GuildMake" ADD CONSTRAINT "GuildMake_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildMake" ADD CONSTRAINT "GuildMake_makeId_fkey"
  FOREIGN KEY ("makeId") REFERENCES "Make"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Match the project's RLS posture (Prisma connects as owner and bypasses RLS).
ALTER TABLE "GuildMake" ENABLE ROW LEVEL SECURITY;
