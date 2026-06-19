// POST /api/guild/release — called by the Igla portal when an admin releases a unit
// (revokes the install / deletes the in-progress draft). Clears the unit's direct-open
// guide grants so its per-unit guide allowance (see MAX_GUIDES_PER_UNIT in /issue) resets
// and the next installation can request guides again.
//
// Auth: Bearer service token (same as /api/guild/issue).
// Body: { unitSerial: string }  →  { ok, cleared }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkServiceToken } from "@/lib/service-auth";
import { logEvent } from "@/lib/audit";

export async function POST(req: NextRequest) {
  if (!(await checkServiceToken(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const unitSerial = String(body.unitSerial ?? "").trim();
  if (!unitSerial) {
    return NextResponse.json({ ok: false, error: "unit_required" }, { status: 400 });
  }

  const grants = await prisma.accessGrant.findMany({
    where: { granteeUnit: unitSerial, directOpen: true },
    select: { id: true },
  });
  if (grants.length === 0) {
    return NextResponse.json({ ok: true, cleared: 0 });
  }

  const ids = grants.map((g) => g.id);
  // Deleting the grants resets the unit's distinct-guide count. Children cascade
  // (GrantGuild / GrantSession / OtpCode); AuditEvent.grantId is set null, so the
  // audit trail is preserved.
  await prisma.accessGrant.deleteMany({ where: { id: { in: ids } } });

  await logEvent({
    actor: null,
    action: "grant_revoked",
    meta: { source: "portal_release", unit: unitSerial, cleared: ids.length },
  });

  return NextResponse.json({ ok: true, cleared: ids.length });
}
