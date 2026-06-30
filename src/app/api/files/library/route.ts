// The reusable file library (Files Manager). A library file is just an
// ImageAsset with a non-null libraryName — uploaded once (direct to S3 via a
// presigned URL, so 100 MB firmware doesn't hit the serverless body limit) and
// picked into many guides instead of re-uploaded each time.
//
//  GET  — list library files (ADMIN + TECH; techs pick existing files)
//  POST — record a freshly-uploaded file as a library entry (ADMIN only)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const files = await prisma.imageAsset.findMany({
    where: { libraryName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, libraryName: true, size: true, mime: true, createdAt: true },
  });
  return NextResponse.json({
    files: files.map((f) => ({
      id: f.id,
      name: f.libraryName,
      size: f.size,
      mime: f.mime,
      createdAt: f.createdAt,
    })),
  });
}

const createSchema = z.object({
  s3Key: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  mime: z.string().optional(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireRole("ADMIN"); // only admins upload to the library
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const asset = await prisma.imageAsset.create({
    data: {
      s3Key: parsed.data.s3Key,
      mime: parsed.data.mime || "application/octet-stream",
      size: parsed.data.size ?? null,
      libraryName: parsed.data.name.trim(),
      uploadedById: user.id,
    },
  });
  return NextResponse.json({ id: asset.id });
}
