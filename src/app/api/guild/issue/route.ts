// POST /api/guild/issue — called by the Igla portal during an install to get a
// ready-to-open guide link for the car being worked on.
//
// Auth: Bearer service token (same as /api/guild/resolve).
// Body: {
//   unitSerial: string,                 // the device unit being installed (required)
//   make?, model?, year?,               // vehicle (free text) …
//   makeId?, modelId?, vin?,            // … or ids / VIN
//   productLine?: "IGLA" | "Compass",   // narrow when several product guides match
//   product?: string,                   // e.g. "231"
//   guildId?: string,                   // force a specific guide (from a chooser)
//   installerLabel?, dealerLabel?       // for the watermark + audit
// }
//
// Flow: verify the unit with the portal (real + eligible) → resolve the guide →
// mint a 1-day, single-guide, direct-open grant bound to the unit → return
// { ok, url } (or { ok, candidates } when ambiguous, or { ok:false, error }).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkServiceToken } from "@/lib/service-auth";
import { verifyUnitWithPortal } from "@/lib/portal";
import { resolveGuild, type ResolveCandidate } from "@/lib/resolve";
import { hashToken, newToken } from "@/lib/auth";
import { logEvent } from "@/lib/audit";

const GRANT_HOURS = 24;

export async function POST(req: NextRequest) {
  if (!(await checkServiceToken(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const unitSerial = String(body.unitSerial ?? "").trim();
  if (!unitSerial) {
    return NextResponse.json({ ok: false, error: "unit_required" }, { status: 400 });
  }
  const forcedGuildId = body.guildId ? String(body.guildId) : null;
  const installerLabel = String(body.installerLabel ?? "").trim();
  const dealerLabel = String(body.dealerLabel ?? "").trim();
  const productLine = body.productLine ? String(body.productLine).trim() : null;
  const product = body.product ? String(body.product).trim() : null;

  // 1) Verify the unit with the portal (real + eligible). Fails closed.
  const elig = await verifyUnitWithPortal(unitSerial);
  if (!elig.valid) {
    return NextResponse.json({ ok: false, error: "unit_invalid", reason: elig.reason });
  }
  if (!elig.eligible) {
    return NextResponse.json({ ok: false, error: "unit_ineligible", reason: elig.reason });
  }

  // 2) Pick the guide.
  let chosen: ResolveCandidate | null = null;
  if (forcedGuildId) {
    const g = await prisma.guild.findFirst({
      where: { id: forcedGuildId, status: "PUBLISHED" },
      include: {
        make: true,
        model: true,
        generation: true,
        trim: true,
        iglaProduct: { include: { productLine: true } },
      },
    });
    if (!g) return NextResponse.json({ ok: false, error: "no_guide" });
    chosen = {
      guildId: g.id,
      title: g.title,
      make: g.make.name,
      model: g.model.name,
      generation: g.generation.name,
      trim: g.trim?.name ?? null,
      product: g.iglaProduct.name,
      productLine: g.iglaProduct.productLine.name,
      confidence: "high",
    };
  } else {
    const result = await resolveGuild({
      make: body.make ? String(body.make) : undefined,
      model: body.model ? String(body.model) : undefined,
      year: body.year ? parseInt(String(body.year), 10) || undefined : undefined,
      makeId: body.makeId ? String(body.makeId) : undefined,
      modelId: body.modelId ? String(body.modelId) : undefined,
      vin: body.vin ? String(body.vin) : undefined,
    });
    // Narrow by the unit's product / line when given.
    let candidates = result.candidates;
    if (product) {
      const p = product.toLowerCase();
      const byProduct = candidates.filter((c) => c.product.toLowerCase() === p);
      if (byProduct.length) candidates = byProduct;
    } else if (productLine) {
      const pl = productLine.toLowerCase();
      const byLine = candidates.filter((c) => c.productLine.toLowerCase() === pl);
      if (byLine.length) candidates = byLine;
    }
    if (candidates.length === 0) {
      return NextResponse.json({ ok: false, error: "no_guide" });
    }
    if (candidates.length > 1) {
      // Ambiguous — let the portal show a chooser, then call back with guildId.
      return NextResponse.json({ ok: true, candidates });
    }
    chosen = candidates[0];
  }

  // 3) Mint (or reuse) the direct-open, unit-bound, 1-day grant.
  const url = await issueUnitGrant({
    guildId: chosen.guildId,
    unitSerial,
    label:
      [installerLabel || "Installer", dealerLabel].filter(Boolean).join(" @ ") +
      ` · unit ${unitSerial}`,
  });

  return NextResponse.json({ ok: true, url, guild: chosen });
}

async function issueUnitGrant(opts: {
  guildId: string;
  unitSerial: string;
  label: string;
}): Promise<string> {
  const now = new Date();
  // One active guide per unit. Re-click for the SAME guide → reuse the link.
  // A different guide (unit released + reinstalled) → revoke the old one.
  const active = await prisma.accessGrant.findFirst({
    where: {
      granteeUnit: opts.unitSerial,
      directOpen: true,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: { guilds: true },
    orderBy: { createdAt: "desc" },
  });
  if (active) {
    const sameGuide = active.guilds.some((g) => g.guildId === opts.guildId);
    if (sameGuide) {
      // Can't recover the raw token (only its hash is stored) — rotate it so we
      // can hand back a working link, keeping a single active grant per unit.
      const token = newToken();
      await prisma.accessGrant.update({
        where: { id: active.id },
        data: { tokenHash: hashToken(token), expiresAt: hoursFromNow(GRANT_HOURS) },
      });
      return autoUrl(token);
    }
    await prisma.accessGrant.update({
      where: { id: active.id },
      data: { revokedAt: now },
    });
    await prisma.grantSession.deleteMany({ where: { grantId: active.id } });
  }

  const token = newToken();
  const grant = await prisma.accessGrant.create({
    data: {
      granteeLabel: opts.label,
      granteeUnit: opts.unitSerial,
      directOpen: true,
      tokenHash: hashToken(token),
      expiresAt: hoursFromNow(GRANT_HOURS),
      guilds: { create: [{ guildId: opts.guildId }] },
    },
  });
  await logEvent({
    actor: { grantId: grant.id },
    action: "grant_created",
    guildId: opts.guildId,
    meta: { source: "portal", unit: opts.unitSerial },
  });
  return autoUrl(token);
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000);
const autoUrl = (token: string) =>
  `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/g/${token}/auto`;
