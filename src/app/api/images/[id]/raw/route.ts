// GET /api/images/[id]/raw — same-origin proxy of the image bytes. The editor
// draws an image to a <canvas> to crop it ("Set as view"); a cross-origin S3
// URL would taint the canvas and block toBlob(), so authors fetch the pixels
// through here instead. Admin/Tech only — this is an authoring surface.
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { s3, BUCKET } from "@/lib/s3";

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
  const asset = await prisma.imageAsset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: asset.s3Key })
  );
  const bytes = await obj.Body!.transformToByteArray();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": asset.mime || "image/jpeg",
      "Cache-Control": "private, max-age=60",
    },
  });
}
