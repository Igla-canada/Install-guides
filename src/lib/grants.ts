// Shared access-grant creation, used by the Access-links page (bulk) and the
// per-guide "Share" panel. Returns the one-time link token (shown to the
// admin exactly once). Must be called from a request context (server action /
// route) since it reads request metadata for the audit log.
import { prisma } from "./db";
import { hashToken, newToken, requestMeta } from "./auth";
import { logEvent } from "./audit";

export const EXPIRY_OPTIONS = [
  { label: "2 hours", hours: 2 },
  { label: "8 hours", hours: 8 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

export async function createAccessGrant(opts: {
  userId: string;
  granteeLabel: string;
  granteePhone: string;
  hours: number;
  maxViews: number | null;
  guildIds: string[];
}): Promise<string> {
  if (!opts.granteeLabel || !opts.granteePhone || opts.guildIds.length === 0) {
    throw new Error("label, phone and at least one guide are required");
  }
  const token = newToken();
  const grant = await prisma.accessGrant.create({
    data: {
      granteeLabel: opts.granteeLabel,
      granteePhone: opts.granteePhone,
      grantedById: opts.userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + opts.hours * 3600_000),
      maxViews: opts.maxViews,
      guilds: { create: opts.guildIds.map((guildId) => ({ guildId })) },
    },
  });
  const meta = await requestMeta();
  await logEvent({
    actor: { userId: opts.userId },
    action: "grant_created",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { grantId: grant.id, granteeLabel: opts.granteeLabel, guildIds: opts.guildIds },
  });
  return token;
}
