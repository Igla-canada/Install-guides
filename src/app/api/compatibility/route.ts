// GET /api/compatibility — machine-readable vehicle compatibility list for
// external apps (e.g. customer-facing portal). Same Bearer service token as
// /api/guild/resolve and /api/taxonomy (`npm run token:service` or
// IGLA_SERVICE_TOKEN).
//
// Query params (all optional):
//   make, model, year  — filter (model uses simplified base-name match)
//   product            — substring match on IGLA product labels
//   published=1        — only rows whose linked guide is PUBLISHED
//
// Returns dealer-visible rows only. Never exposes internalAdminNotes.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkServiceToken } from "@/lib/service-auth";
import {
  buildCompatibilityWhere,
  excludeHiddenCompatibilityRows,
  loadLiveGuideCompatInfo,
  modelMatchesBase,
  toPublicCompatibilityItem,
} from "@/lib/vehicle-compatibility";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const make = sp.get("make")?.trim() || undefined;
  const model = sp.get("model")?.trim() || undefined;
  const yearRaw = sp.get("year");
  const yearNum = yearRaw ? Number(yearRaw) : undefined;
  const year =
    yearNum != null && !Number.isNaN(yearNum) ? yearNum : undefined;
  const product = sp.get("product")?.trim() || undefined;
  const publishedOnly = sp.get("published") === "1";

  if (yearRaw && year == null) {
    return NextResponse.json({ error: "bad_request", detail: "invalid year" }, { status: 400 });
  }

  const where = buildCompatibilityWhere({
    make,
    year,
    makeExact: Boolean(make),
    visibleOnly: true,
  });

  const rawRows = await prisma.vehicleCompatibility.findMany({
    where,
    orderBy: [{ make: "asc" }, { model: "asc" }, { yearFrom: "asc" }],
    select: {
      id: true,
      make: true,
      model: true,
      yearFrom: true,
      yearTo: true,
      iglaProducts: true,
      analogBlockRequired: true,
      analogBlockType: true,
      dealerNotes: true,
      sourceGuideId: true,
      sourceGuideStatus: true,
    },
  });

  let rows = model
    ? rawRows.filter((r) => modelMatchesBase(r.model, model))
    : rawRows;

  if (product) {
    const needle = product.toLowerCase();
    rows = rows.filter((r) =>
      r.iglaProducts.some((p) => p.toLowerCase().includes(needle)),
    );
  }

  const liveCompat = await loadLiveGuideCompatInfo(
    rows.map((r) => r.sourceGuideId),
  );
  rows = excludeHiddenCompatibilityRows(rows, liveCompat);

  let items = rows.map((r) =>
    toPublicCompatibilityItem(
      r,
      r.sourceGuideId ? liveCompat.get(r.sourceGuideId)?.status ?? null : null,
    ),
  );

  if (publishedOnly) {
    items = items.filter((i) => i.guidePublished);
  }

  return NextResponse.json({
    items,
    count: items.length,
  });
}
