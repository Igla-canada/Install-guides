// Server-proxied upload: the browser POSTs the file here (same origin), and
// the server streams it to S3 and creates the ImageAsset row in one place.
// This avoids browser→S3 CORS entirely (the fragile part on Vercel) and
// guarantees the object and the DB row are created together.
//
// Note: keep client uploads modest in size — Vercel serverless functions cap
// the request body at ~4.5 MB. Images are downscaled client-side before they
// reach here; firmware/settings files are small.
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireRole, AuthError } from "@/lib/auth";
import { s3, BUCKET, ensureBucket } from "@/lib/s3";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const name = String(form.get("name") ?? file.name ?? "upload");
  const widthRaw = form.get("width");
  const heightRaw = form.get("height");
  const ext =
    (name.includes(".") ? name.split(".").pop() : mime.split("/")[1] ?? "bin")!
      .toLowerCase()
      .replace("jpeg", "jpg")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "bin";
  const s3Key = `images/${new Date().toISOString().slice(0, 10)}/${randomBytes(12).toString("hex")}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  try {
    await ensureBucket();
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: buf,
        ContentType: mime,
      })
    );
  } catch (e) {
    console.error("S3 upload failed", e);
    return NextResponse.json({ error: "s3_failed" }, { status: 502 });
  }

  const asset = await prisma.imageAsset.create({
    data: {
      s3Key,
      mime,
      width: widthRaw ? parseInt(String(widthRaw), 10) || null : null,
      height: heightRaw ? parseInt(String(heightRaw), 10) || null : null,
      uploadedById: user.id,
    },
  });

  return NextResponse.json({ assetId: asset.id });
}
