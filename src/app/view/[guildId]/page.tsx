// Watermarked, view-only guild page for persistent-login installer accounts.
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, requestMeta } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { loadGuildDoc } from "@/lib/guild-doc";
import GuildView from "@/components/viewer/guild-view";
import Watermark from "@/components/viewer/watermark";
import ViewerShield from "@/components/viewer/viewer-shield";

export const dynamic = "force-dynamic";

export default async function InstallerGuildViewPage(props: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await props.params;
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "INSTALLER") redirect(`/guides/${guildId}`);

  const meta = await requestMeta();
  const grant = await prisma.installerGuild.findUnique({
    where: { userId_guildId: { userId: user.id, guildId } },
  });
  // "All guides" installers bypass per-guild grants entirely. Otherwise the
  // grant must exist and still be within its time frame (null = permanent).
  const expired = Boolean(grant?.expiresAt && grant.expiresAt <= new Date());
  const allowed = user.allGuides || (grant && !expired);
  const doc = allowed ? await loadGuildDoc(guildId) : null;
  if (!allowed || !doc || doc.status !== "PUBLISHED") {
    await logEvent({
      actor: { userId: user.id },
      action: "denied",
      guildId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { reason: expired ? "grant_expired" : "guild_not_granted" },
    });
    redirect("/my-guides");
  }

  await logEvent({
    actor: { userId: user.id },
    guildId,
    action: "view",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return (
    <main className="no-print-page min-h-screen bg-zinc-900 px-4 py-6">
      <Watermark dark label={user.name} reference={`U-${user.id.slice(-8)}`} />
      <ViewerShield guildId={guildId} />
      <GuildView
        doc={doc}
        theme="dark"
        watermark={{ label: user.name, reference: `U-${user.id.slice(-8)}` }}
      />
      <p className="mx-auto mt-8 max-w-3xl text-center text-xs text-zinc-500">
        Licensed to {user.name}. View-only — this access is recorded.
      </p>
    </main>
  );
}
