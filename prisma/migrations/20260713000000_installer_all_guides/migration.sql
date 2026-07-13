-- Blanket "all published guides" access for an installer account. When true,
-- per-guide InstallerGuild rows are ignored and the installer can view every
-- PUBLISHED guide, including ones published after this flag was set.
ALTER TABLE "UserAccount" ADD COLUMN "allGuides" BOOLEAN NOT NULL DEFAULT false;
