import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

const annotationSchema = z.object({
  shape: z.enum(["point", "arrow", "line", "box", "circle", "freehand"]),
  coords: z.unknown(), // normalized 0–1; shape-specific structure
  label: z.string(),
  description: z.string().optional(),
  color: z.string().default("#ef4444"),
  order: z.number().int().default(0),
});

// Optional saved zoom/crop "view" for the image. null clears it (full image).
const viewSchema = z
  .object({ z: z.number(), px: z.number(), py: z.number() })
  .nullable()
  .optional();

const schema = z.object({
  annotations: z.array(annotationSchema),
  view: viewSchema,
});

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

  // Only touch the saved view when the client sends the key (undefined = leave
  // as-is; null = clear; object = set).
  const viewUpdate =
    parsed.data.view === undefined
      ? {}
      : { view: (parsed.data.view ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull };

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
    ...(parsed.data.view === undefined
      ? []
      : [prisma.imageAsset.update({ where: { id }, data: viewUpdate as Prisma.ImageAssetUpdateInput })]),
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
  const [annotations, asset] = await Promise.all([
    prisma.annotation.findMany({ where: { imageAssetId: id }, orderBy: { order: "asc" } }),
    prisma.imageAsset.findUnique({ where: { id }, select: { view: true } }),
  ]);
  return NextResponse.json({ annotations, view: asset?.view ?? null });
}
