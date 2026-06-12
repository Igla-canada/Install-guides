import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const annotationSchema = z.object({
  shape: z.enum(["point", "arrow", "line", "box", "freehand"]),
  coords: z.unknown(), // normalized 0–1; shape-specific structure
  label: z.string(),
  description: z.string().optional(),
  color: z.string().default("#ef4444"),
  order: z.number().int().default(0),
});

const schema = z.object({ annotations: z.array(annotationSchema) });

/** Replace-all save: annotations stay editable data over the original image. */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const asset = await prisma.imageAsset.findUnique({ where: { id } });
  if (!asset)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction([
    prisma.annotation.deleteMany({ where: { imageAssetId: id } }),
    prisma.annotation.createMany({
      data: parsed.data.annotations.map((a, i) => ({
        imageAssetId: id,
        shape: a.shape,
        coords: a.coords as Prisma.InputJsonValue,
        label: a.label,
        description: a.description,
        color: a.color,
        order: a.order ?? i,
      })),
    }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const { id } = await ctx.params;
  const annotations = await prisma.annotation.findMany({
    where: { imageAssetId: id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ annotations });
}
