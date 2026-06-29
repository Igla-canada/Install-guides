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
// Max number of DISTINCT guides that may ever be served for one unit. Lets an installer
// correct a wrong make/model/year once (2 guides total), then no more are issued.
const MAX_GUIDES_PER_UNIT = 2;

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
        products: { include: { iglaProduct: { include: { productLine: true } } } },
      },
    });
    if (!g) return NextResponse.json({ ok: false, error: "no_guide" });
    const productNames = g.products.map((p) => p.iglaProduct.name);
    const lineNames = [...new Set(g.products.map((p) => p.iglaProduct.productLine.name))];
    chosen = {
      guildId: g.id,
      title: g.title,
      make: g.make.name,
      model: g.model.name,
      generation: g.generation.name,
      trim: g.trim?.name ?? null,
      product: g.iglaProduct.name,
      productLine: g.iglaProduct.productLine.name,
      products: productNames.length ? productNames : [g.iglaProduct.name],
      productLines: lineNames.length ? lineNames : [g.iglaProduct.productLine.name],
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
    // Narrow to the guide for THIS unit's product, so an IGLA Alarm unit gets
    // the Alarm install and an IGLA 231 unit gets the 231 install. Prefer a
    // product the portal explicitly passed; otherwise use the unit's own type
    // from the eligibility check (the portal's inventory record). Match against
    // EVERY product a guide covers, tolerant of "231" vs "IGLA 231" spelling.
    // Only narrows when something matches — a naming drift falls back to the
    // full candidate list (chooser) rather than serving the wrong guide.
    let candidates = result.candidates;
    const unitProduct = product ?? elig.unitType ?? null;
    if (unitProduct && candidates.length) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const target = norm(unitProduct);
      const exact = candidates.filter((c) => c.products.some((p) => norm(p) === target));
      const fuzzy = candidates.filter((c) =>
        c.products.some((p) => {
          const n = norm(p);
          return n.includes(target) || target.includes(n);
        })
      );
      const narrowed = exact.length ? exact : fuzzy;
      if (narrowed.length) {
        candidates = narrowed;
      } else {
        // The vehicle HAS published guide(s), just not for THIS unit's product
        // type (e.g. a RAM 1500 has an IGLA FD guide but the scanned unit is an
        // IGLA 231). Don't serve the wrong-type guide and don't pretend nothing
        // exists — tell the caller which products this vehicle is covered for so
        // the portal can say "no IGLA 231 guide, but an IGLA FD guide exists".
        const availableProducts = [...new Set(candidates.flatMap((c) => c.products))];
        await logEvent({
          actor: null,
          action: "resolve",
          guildId: null,
          meta: {
            source: "portal",
            unit: unitSerial,
            outcome: "wrong_product",
            unitType: unitProduct,
            availableProducts,
          },
        });
        return NextResponse.json({
          ok: false,
          error: "wrong_product",
          unitType: unitProduct,
          availableProducts,
        });
      }
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

  // 3) Mint (or reuse) the direct-open, unit-bound, 1-day grant — capped per unit.
  const grant = await issueUnitGrant({
    guildId: chosen.guildId,
    unitSerial,
    label:
      [installerLabel || "Installer", dealerLabel].filter(Boolean).join(" @ ") +
      ` · unit ${unitSerial}`,
  });
  if ("limited" in grant) {
    return NextResponse.json({
      ok: false,
      error: "guide_limit",
      servedGuides: grant.served,
      maxGuides: grant.max,
    });
  }

  // guidesRemaining: how many NEW guides this unit may still be served (0 = locked).
  return NextResponse.json({
    ok: true,
    url: grant.url,
    guild: chosen,
    guidesRemaining: grant.remaining,
  });
}

async function issueUnitGrant(opts: {
  guildId: string;
  unitSerial: string;
  label: string;
}): Promise<{ url: string; remaining: number } | { limited: true; served: number; max: number }> {
  const now = new Date();

  // Every direct-open grant ever minted for this unit (newest first). The set of distinct
  // guildIds across them is how many DIFFERENT guides this unit has been served.
  const grants = await prisma.accessGrant.findMany({
    where: { granteeUnit: opts.unitSerial, directOpen: true },
    include: { guilds: true },
    orderBy: { createdAt: "desc" },
  });
  const servedGuideIds = new Set(grants.flatMap((g) => g.guilds.map((x) => x.guildId)));
  const isNewGuide = !servedGuideIds.has(opts.guildId);

  // Cap distinct guides per unit. Re-opening a guide already served (closed tab, expired link)
  // is always allowed and does NOT count — only a brand-new guide consumes the budget.
  if (isNewGuide && servedGuideIds.size >= MAX_GUIDES_PER_UNIT) {
    return { limited: true, served: servedGuideIds.size, max: MAX_GUIDES_PER_UNIT };
  }
  const distinctAfter = isNewGuide ? servedGuideIds.size + 1 : servedGuideIds.size;
  const remaining = Math.max(0, MAX_GUIDES_PER_UNIT - distinctAfter);

  // One active link per unit. Re-click for the SAME guide → reuse (rotate) the link.
  const active = grants.find((g) => !g.revokedAt && g.expiresAt > now) ?? null;
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
      return { url: autoUrl(token), remaining };
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
  return { url: autoUrl(token), remaining };
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000);
const autoUrl = (token: string) =>
  `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/g/${token}/auto`;
