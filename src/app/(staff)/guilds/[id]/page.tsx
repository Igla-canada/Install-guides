import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadGuildDoc, publishGuild, rollbackGuild, PublishConflictError } from "@/lib/guild-doc";
import { loadTaxonomy } from "@/lib/taxonomy";
import { prisma } from "@/lib/db";
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
        redirect(`/guilds/${id}?publish_error=conflict`);
      }
      throw e;
    }
    redirect(`/guilds/${id}`);
  }

  async function rollbackAction(formData: FormData) {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    const versionNo = Number(formData.get("versionNo"));
    await rollbackGuild(id, versionNo, u.id);
    redirect(`/guilds/${id}`);
  }

  return (
    <GuildEditor
      initialDoc={JSON.parse(JSON.stringify(doc))}
      taxonomy={JSON.parse(JSON.stringify(taxonomy))}
      versions={JSON.parse(JSON.stringify(versions))}
      quickPicks={JSON.parse(JSON.stringify(quickPicks))}
      publishAction={publishAction}
      rollbackAction={rollbackAction}
      publishError={publish_error}
      currentUserId={user.id}
    />
  );
}
