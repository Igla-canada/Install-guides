// Audited file-attachment download (firmware .bin etc.). Unlike the guide
// page itself, file blocks exist to be flashed onto the device, so verified
// installers may download them — every download is logged per actor.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser, requestMeta } from "@/lib/auth";
import { currentGrant } from "@/lib/grant-auth";
import { signedViewUrl } from "@/lib/s3";
import { logEvent } from "@/lib/audit";

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
  if (!staff) {
    // Installer paths: must have access to the guild AND the file must be
    // referenced by that guild's content.
    if (!guildId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const hasAccess = grant
      ? await prisma.grantGuild.findUnique({
          where: { grantId_guildId: { grantId: grant.id, guildId } },
        })
      : await prisma.installerGuild.findUnique({
          where: { userId_guildId: { userId: user!.id, guildId } },
        });
    let referenced = false;
    if (hasAccess) {
      const blocks = await prisma.block.findMany({
        where: { section: { guildId }, type: { in: ["file", "file_text"] } },
        select: { content: true },
      });
      referenced = blocks.some(
        (b) => (b.content as { assetId?: string })?.assetId === id
      );
    }
    if (!referenced) {
      await logEvent({
        actor: grant ? { grantId: grant.id } : { userId: user!.id },
        guildId,
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

  const url = await signedViewUrl(asset.s3Key, 120);
  return NextResponse.redirect(url);
}
