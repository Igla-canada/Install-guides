// Short-lived signed URL for staff editing surfaces. Installer-facing views
// get their signed URLs injected server-side at render time — they never call
// this endpoint.
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { signedViewUrl } from "@/lib/s3";

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
  if (!asset)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = await signedViewUrl(asset.s3Key, 600);
  return NextResponse.json({ url, width: asset.width, height: asset.height });
}
