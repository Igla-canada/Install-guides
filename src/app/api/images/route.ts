import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  s3Key: z.string().min(1),
  mime: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const asset = await prisma.imageAsset.create({
    data: { ...parsed.data, uploadedById: user.id },
  });
  return NextResponse.json({ assetId: asset.id });
}
