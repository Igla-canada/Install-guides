// GET /g/<token>/auto — entry point for portal-issued (direct-open) guide links.
// The portal already authenticated the installer, so instead of an SMS code we
// establish the watermarked viewing session immediately and redirect into the
// guide. Non-direct (SMS) grants fall back to the normal gate.
import { NextRequest, NextResponse } from "next/server";
import { requestMeta } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import {
  GRANT_COOKIE,
  checkGrantToken,
  grantCookieOptions,
  startGrantSession,
} from "@/lib/grant-auth";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const gate = new URL(`/g/${token}`, req.url);
  const check = await checkGrantToken(token);
  // Invalid/expired/revoked, or a normal SMS grant → let the gate page handle it.
  if (!check.ok || !check.grant.directOpen) {
    return NextResponse.redirect(gate);
  }

  const sessionToken = await startGrantSession(check.grant.id);
  const meta = await requestMeta();
  await logEvent({
    actor: { grantId: check.grant.id },
    action: "otp_verified",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { direct: true, unit: check.grant.granteeUnit },
  });

  const res = NextResponse.redirect(gate);
  res.cookies.set(GRANT_COOKIE, sessionToken, grantCookieOptions());
  return res;
}
