// Audited file-attachment download (firmware .bin etc.). Unlike the guide
// page itself, file blocks exist to be flashed onto the device, so verified
// installers may download them — every download is logged per actor.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser, requestMeta } from "@/lib/auth";
import { currentGrant } from "@/lib/grant-auth";
import { signedDownloadUrl } from "@/lib/s3";
import { logEvent } from "@/lib/audit";

// A file/file_text block references its attachments either as a flat
// { assetId, name } (legacy) or as a { files: [{ assetId, name }] } array
// (multi-file blocks). Flatten both shapes to one list of entries.
type FileEntry = { assetId: string; name?: string };
function fileEntries(content: unknown): FileEntry[] {
  const c = content as { assetId?: string; name?: string; files?: unknown };
  if (Array.isArray(c?.files)) {
    return c.files.filter(
      (f): f is FileEntry => !!f && typeof (f as FileEntry).assetId === "string"
    );
  }
  if (typeof c?.assetId === "string") return [{ assetId: c.assetId, name: c.name }];
  return [];
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const guildId = req.nextUrl.searchParams.get("guild");
  const meta = await requestMeta();

  const user = await currentUser();
  const grant = user ? null : await currentGrant();
  if (!user && !grant) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const asset = await prisma.imageAsset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const staff = user && (user.role === "ADMIN" || user.role === "TECH");

  // The display name lives in the referencing block's content (not on the
  // ImageAsset), so scan the guild's file blocks: this both gates installer
  // access (the file must be referenced) and gives us the download filename.
  let referenced = false;
  let fileName = "";
  if (guildId) {
    const blocks = await prisma.block.findMany({
      where: { section: { guildId }, type: { in: ["file", "file_text"] } },
      select: { content: true },
    });
    for (const b of blocks) {
      const entry = fileEntries(b.content).find((e) => e.assetId === id);
      if (entry) {
        referenced = true;
        if (entry.name) fileName = entry.name;
        break;
      }
    }
  }

  if (!staff) {
    // Installer paths: must have access to the guild AND the file must be
    // referenced by that guild's content.
    const hasAccess =
      guildId &&
      (grant
        ? await prisma.grantGuild.findUnique({
            where: { grantId_guildId: { grantId: grant.id, guildId } },
          })
        : // "All guides" installers bypass per-guild grants; otherwise the grant
          // must exist and not be past its time frame.
          user!.allGuides ||
          (await prisma.installerGuild.findFirst({
            where: {
              userId: user!.id,
              guildId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          })));
    if (!hasAccess || !referenced) {
      await logEvent({
        actor: grant ? { grantId: grant.id } : { userId: user!.id },
        guildId: guildId ?? null,
        action: "denied",
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { reason: "file_not_granted", assetId: id },
      });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  await logEvent({
    actor: user ? { userId: user.id } : { grantId: grant!.id },
    guildId: guildId ?? null,
    action: "file_download",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { assetId: id },
  });

  // Prefer the name from the guide block; library files use libraryName;
  // last resort is a stable id-based name.
  const name = fileName || asset.libraryName || `file-${asset.id}`;
  const url = await signedDownloadUrl(asset.s3Key, name, 120);
  return NextResponse.redirect(url);
}
