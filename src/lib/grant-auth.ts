// One-time-link access: grant tokens, SMS one-time codes, and the short-lived
// viewing session that follows OTP verification. Content is ALWAYS served from
// the backend per request — a link carries no content, so access can be cut
// instantly (revoke) and every view is logged.
import { cookies } from "next/headers";
import { createHash, randomInt } from "crypto";
import { prisma } from "./db";
import { hashToken, newToken } from "./auth";
import { smsProvider } from "./sms";
import type { AccessGrant } from "@prisma/client";

export const GRANT_COOKIE = "igla_grant_session";
const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
const GRANT_SESSION_TTL_MIN = 60;

export type GrantCheck =
  | { ok: true; grant: AccessGrant }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "exhausted" };

export async function checkGrantToken(token: string): Promise<GrantCheck> {
  const grant = await prisma.accessGrant.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!grant) return { ok: false, reason: "not_found" };
  if (grant.revokedAt) return { ok: false, reason: "revoked" };
  if (grant.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (grant.maxViews != null && grant.viewsUsed >= grant.maxViews)
    return { ok: false, reason: "exhausted" };
  return { ok: true, grant };
}

export async function sendOtp(grantId: string): Promise<void> {
  const grant = await prisma.accessGrant.findUniqueOrThrow({
    where: { id: grantId },
  });
  if (!grant.granteePhone) {
    // Direct-open (portal) grants have no phone and never use SMS.
    throw new Error("grant has no phone number for SMS");
  }
  const code = randomInt(100000, 1000000).toString();
  await prisma.otpCode.create({
    data: {
      grantId,
      codeHash: createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
    },
  });
  await smsProvider().send(
    grant.granteePhone,
    `Igla install guide code: ${code}. Valid ${OTP_TTL_MIN} minutes. Do not share.`
  );
}

/** Mint a short-lived viewing session for a grant and return its raw token. */
export async function startGrantSession(grantId: string): Promise<string> {
  const sessionToken = newToken();
  await prisma.grantSession.create({
    data: {
      grantId,
      tokenHash: hashToken(sessionToken),
      expiresAt: new Date(Date.now() + GRANT_SESSION_TTL_MIN * 60_000),
    },
  });
  return sessionToken;
}

export async function verifyOtp(
  grantId: string,
  code: string
): Promise<{ ok: boolean; sessionToken?: string }> {
  const codeHash = createHash("sha256").update(code.trim()).digest("hex");
  const otp = await prisma.otpCode.findFirst({
    where: { grantId, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return { ok: false };
  if (otp.codeHash !== codeHash) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false };
  }
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  const sessionToken = await startGrantSession(grantId);
  return { ok: true, sessionToken };
}

/** The verified grant for the current request, or null. */
export async function currentGrant(): Promise<AccessGrant | null> {
  const store = await cookies();
  const token = store.get(GRANT_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.grantSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { grant: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const g = session.grant;
  if (g.revokedAt || g.expiresAt < new Date()) return null;
  return g;
}

export function grantCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GRANT_SESSION_TTL_MIN * 60,
  };
}
