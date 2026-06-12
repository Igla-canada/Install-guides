import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireRole, AuthError } from "@/lib/auth";
import { signedUploadUrl } from "@/lib/s3";

const schema = z.object({ mime: z.string(), name: z.string().optional() });

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const ext = parsed.data.mime.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
  const s3Key = `images/${new Date().toISOString().slice(0, 10)}/${randomBytes(12).toString("hex")}.${ext}`;
  const uploadUrl = await signedUploadUrl(s3Key, parsed.data.mime);
  return NextResponse.json({ uploadUrl, s3Key });
}
