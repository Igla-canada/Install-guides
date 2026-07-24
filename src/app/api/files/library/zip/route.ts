// Staff-only ZIP of library files (selected ids, or entire library).
// Streams from S3 so we don't buffer every firmware blob in memory at once.
import { PassThrough, Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireRole, requestMeta } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import { BUCKET, ensureBucket, s3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeZipName(name: string, id: string, used: Set<string>): string {
  const clean =
    (name || `file-${id}`).replace(/[\\/:*?"<>|]/g, "_").trim() || `file-${id}`;
  let out = clean;
  let n = 2;
  while (used.has(out.toLowerCase())) {
    const dot = clean.lastIndexOf(".");
    out =
      dot > 0
        ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}`
        : `${clean} (${n})`;
    n++;
  }
  used.add(out.toLowerCase());
  return out;
}

export async function POST(req: NextRequest) {
  const user = await requireRole("ADMIN");
  await ensureBucket();

  let ids: string[] | undefined;
  try {
    const body = (await req.json()) as { ids?: string[] };
    if (Array.isArray(body.ids)) {
      ids = [...new Set(body.ids.map((x) => String(x).trim()).filter(Boolean))];
    }
  } catch {
    ids = undefined;
  }

  const files = await prisma.imageAsset.findMany({
    where: {
      libraryName: { not: null },
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    orderBy: { libraryName: "asc" },
    select: { id: true, libraryName: true, s3Key: true, mime: true },
  });

  if (!files.length) {
    return NextResponse.json({ error: "no_files" }, { status: 404 });
  }

  const meta = await requestMeta();
  await logEvent({
    actor: { userId: user.id },
    action: "library_zip_download",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { count: files.length, selected: Boolean(ids?.length) },
  });

  const pass = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 1 } });
  archive.on("error", (err) => pass.destroy(err));
  archive.pipe(pass);

  const usedNames = new Set<string>();
  (async () => {
    try {
      for (const f of files) {
        const res = await s3.send(
          new GetObjectCommand({ Bucket: BUCKET, Key: f.s3Key }),
        );
        if (!res.Body) continue;
        const entryName = safeZipName(
          f.libraryName ?? `file-${f.id}`,
          f.id,
          usedNames,
        );
        // AWS SDK v3 Body is async iterable / Readable in Node.
        archive.append(res.Body as NodeJS.ReadableStream, { name: entryName });
      }
      await archive.finalize();
    } catch (e) {
      archive.abort();
      pass.destroy(e instanceof Error ? e : new Error("zip_failed"));
    }
  })();

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(Readable.toWeb(pass) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="igla-library-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
