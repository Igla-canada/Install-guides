-- Time-limited (or permanent) guild access for persistent-login installer accounts.
ALTER TABLE "InstallerGuild" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "InstallerGuild" ADD COLUMN "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
