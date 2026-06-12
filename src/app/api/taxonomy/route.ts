// GET /api/taxonomy — feeds the Igla portal's install-form DROPDOWNS so they
// always mirror this system's vocabulary. When the portal sends these exact
// values (or ids) to /api/guild/resolve, matching is deterministic — no
// free-text guessing. Same bearer service token as the resolve endpoint.
//
// Optional ?published=1 limits the tree to vehicles that actually have a
// published guild (so the portal only offers cars with available guides).
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";

async function checkServiceToken(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  if (process.env.IGLA_SERVICE_TOKEN && token === process.env.IGLA_SERVICE_TOKEN) {
    return true;
  }
  const hash = createHash("sha256").update(token).digest("hex");
  const row = await prisma.serviceToken.findUnique({ where: { tokenHash: hash } });
  return Boolean(row && !row.revokedAt);
}

export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const publishedOnly = req.nextUrl.searchParams.get("published") === "1";

  const publishedGuilds = publishedOnly
    ? await prisma.guild.findMany({
        where: { status: "PUBLISHED" },
        select: { makeId: true, modelId: true, generationId: true },
      })
    : null;
  const makeIds = publishedGuilds ? new Set(publishedGuilds.map((g) => g.makeId)) : null;
  const modelIds = publishedGuilds ? new Set(publishedGuilds.map((g) => g.modelId)) : null;
  const genIds = publishedGuilds
    ? new Set(publishedGuilds.map((g) => g.generationId))
    : null;

  const [makes, productLines] = await Promise.all([
    prisma.make.findMany({
      orderBy: { name: "asc" },
      include: {
        models: {
          orderBy: { name: "asc" },
          include: { generations: { orderBy: { yearStart: "asc" } } },
        },
      },
    }),
    prisma.productLine.findMany({
      orderBy: { name: "asc" },
      include: { products: { orderBy: { name: "asc" } } },
    }),
  ]);

  return NextResponse.json({
    makes: makes
      .filter((m) => !makeIds || makeIds.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        models: m.models
          .filter((mo) => !modelIds || modelIds.has(mo.id))
          .map((mo) => ({
            id: mo.id,
            name: mo.name,
            yearRanges: mo.generations
              .filter((g) => !genIds || genIds.has(g.id))
              .map((g) => ({
                id: g.id,
                yearStart: g.yearStart,
                yearEnd: g.yearEnd,
              })),
          })),
      })),
    productLines: productLines.map((pl) => ({
      id: pl.id,
      name: pl.name,
      products: pl.products.map((p) => ({
        id: p.id,
        name: p.name,
        modelCode: p.modelCode,
      })),
    })),
  });
}
