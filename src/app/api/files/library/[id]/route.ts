// DELETE a library file (ADMIN). Refused while any guide still references it —
// deleting the asset would dangle that guide's download link. Unreference it
// from those guides first, then delete.
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { s3, BUCKET } from "@/lib/s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const { id } = await ctx.params;
  const asset = await prisma.imageAsset.findUnique({ where: { id } });
  if (!asset || asset.libraryName == null)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Is it referenced by any guide's file blocks?
  const blocks = await prisma.block.findMany({
    where: { type: { in: ["file", "file_text"] } },
    select: { content: true },
  });
  const referenced = blocks.some((b) => {
    const c = b.content as { assetId?: string; files?: Array<{ assetId?: string }> };
    if (c?.assetId === id) return true;
    return Array.isArray(c?.files) && c.files.some((f) => f?.assetId === id);
  });
  if (referenced) {
    return NextResponse.json({ error: "in_use" }, { status: 409 });
  }

  await prisma.imageAsset.delete({ where: { id } });
  // Best-effort S3 cleanup.
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: asset.s3Key }));
  } catch {
    /* leave the object — the row is gone, which is what matters */
  }
  return NextResponse.json({ ok: true });
}
