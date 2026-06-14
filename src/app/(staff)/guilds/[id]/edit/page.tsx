import { notFound, redirect } from "next/navigation";
import { requireRole, requestMeta } from "@/lib/auth";
import { loadGuildDoc, publishGuild, rollbackGuild, PublishConflictError } from "@/lib/guild-doc";
import { loadTaxonomy } from "@/lib/taxonomy";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import GuildEditor from "@/components/editor/guild-editor";

export default async function GuildEditorPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ publish_error?: string }>;
}) {
  const user = await requireRole("ADMIN", "TECH");
  const { id } = await props.params;
  const { publish_error } = await props.searchParams;
  const doc = await loadGuildDoc(id);
  if (!doc) notFound();

  const [taxonomy, versions, quickPicks] = await Promise.all([
    loadTaxonomy(),
    prisma.guildVersion.findMany({
      where: { guildId: id },
      orderBy: { versionNo: "desc" },
      take: 20,
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.quickPick.findMany({
      where: {
        OR: [
          { scope: "org" },
          { scope: "personal", ownerId: user.id },
          { scope: "per_make", makeId: doc.makeId },
        ],
      },
      orderBy: { useCount: "desc" },
      take: 50,
    }),
  ]);

  async function publishAction() {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    try {
      await publishGuild(id, u.id);
    } catch (e) {
      if (e instanceof PublishConflictError) {
        redirect(`/guilds/${id}/edit?publish_error=conflict`);
      }
      throw e;
    }
    // After a successful publish, show what installers will see.
    redirect(`/guilds/${id}`);
  }

  async function rollbackAction(formData: FormData) {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    const versionNo = Number(formData.get("versionNo"));
    await rollbackGuild(id, versionNo, u.id);
    redirect(`/guilds/${id}/edit`);
  }

  // Unpublish: take a live guide back to DRAFT so it can be edited without
  // serving a half-finished version. It vanishes from installers, the resolve
  // API and access-grant views — but unlike archive it stays in the normal
  // working set, and its published version snapshots are kept for re-publish.
  async function unpublishAction() {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    const g = await prisma.guild.findUniqueOrThrow({ where: { id } });
    if (g.status === "PUBLISHED") {
      await prisma.guild.update({
        where: { id },
        data: { status: "DRAFT", updatedById: u.id },
      });
      const meta = await requestMeta();
      await logEvent({
        actor: { userId: u.id },
        guildId: id,
        action: "guild_unpublished",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    redirect(`/guilds/${id}/edit`);
  }

  // Archive keeps everything (content, versions, audit history) but hides the
  // guild from installers, the resolve API and new access grants.
  async function archiveAction() {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    const g = await prisma.guild.findUniqueOrThrow({ where: { id } });
    const next = g.status === "ARCHIVED" ? "DRAFT" : "ARCHIVED";
    await prisma.guild.update({
      where: { id },
      data: { status: next, updatedById: u.id },
    });
    const meta = await requestMeta();
    await logEvent({
      actor: { userId: u.id },
      guildId: id,
      action: next === "ARCHIVED" ? "guild_archived" : "guild_restored",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    redirect(`/guilds/${id}/edit`);
  }

  // Hard delete — admin only, irreversible (sections, versions, grant links
  // go with it; audit events are kept with the guild reference nulled).
  async function deleteAction() {
    "use server";
    const u = await requireRole("ADMIN");
    const g = await prisma.guild.findUniqueOrThrow({ where: { id } });
    const meta = await requestMeta();
    await logEvent({
      actor: { userId: u.id },
      action: "guild_deleted",
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { guildId: id, title: g.title },
    });
    await prisma.guild.delete({ where: { id } });
    redirect("/guilds");
  }

  return (
    <GuildEditor
      initialDoc={JSON.parse(JSON.stringify(doc))}
      taxonomy={JSON.parse(JSON.stringify(taxonomy))}
      versions={JSON.parse(JSON.stringify(versions))}
      quickPicks={JSON.parse(JSON.stringify(quickPicks))}
      publishAction={publishAction}
      rollbackAction={rollbackAction}
      unpublishAction={unpublishAction}
      archiveAction={archiveAction}
      deleteAction={deleteAction}
      isAdmin={user.role === "ADMIN"}
      publishError={publish_error}
      currentUserId={user.id}
    />
  );
}
