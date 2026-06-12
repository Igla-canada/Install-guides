// Watermarked, view-only guild page for a verified one-time-link session.
// Rendered fresh per request — never cached, never downloadable (AGENTS.md #3/#4).
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requestMeta } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { checkGrantToken, currentGrant } from "@/lib/grant-auth";
import { loadGuildDoc } from "@/lib/guild-doc";
import GuildView from "@/components/viewer/guild-view";
import Watermark from "@/components/viewer/watermark";
import ViewerShield from "@/components/viewer/viewer-shield";

export const dynamic = "force-dynamic";

export default async function GrantGuildViewPage(props: {
  params: Promise<{ token: string; guildId: string }>;
}) {
  const { token, guildId } = await props.params;
  const check = await checkGrantToken(token);
  if (!check.ok) redirect(`/g/${token}`);
  const grant = check.grant;

  const session = await currentGrant();
  if (session?.id !== grant.id) redirect(`/g/${token}`);

  const meta = await requestMeta();
  const allowed = await prisma.grantGuild.findUnique({
    where: { grantId_guildId: { grantId: grant.id, guildId } },
  });
  const doc = allowed ? await loadGuildDoc(guildId) : null;
  if (!allowed || !doc || doc.status !== "PUBLISHED") {
    await logEvent({
      actor: { grantId: grant.id },
      action: "denied",
      guildId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { reason: "guild_not_granted" },
    });
    redirect(`/g/${token}`);
  }

  // Count + log this view.
  await prisma.accessGrant.update({
    where: { id: grant.id },
    data: { viewsUsed: { increment: 1 } },
  });
  await logEvent({
    actor: { grantId: grant.id },
    guildId,
    action: "view",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return (
    <main className="no-print-page min-h-screen bg-zinc-900 px-4 py-6">
      <Watermark dark label={grant.granteeLabel} reference={`G-${grant.id.slice(-8)}`} />
      <ViewerShield guildId={guildId} />
      <GuildView doc={doc} theme="dark" />
      <p className="mx-auto mt-8 max-w-3xl text-center text-xs text-zinc-500">
        Licensed to {grant.granteeLabel}. View-only — this access is recorded.
      </p>
    </main>
  );
}
