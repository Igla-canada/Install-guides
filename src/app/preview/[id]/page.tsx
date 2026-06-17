// Staff-only "what the installer will see" preview — the EXACT same renderer
// and dark theme as the real installer view, embedded in the editor's Preview
// tab. Drafts render too (so you can check before publishing).
import { notFound, redirect } from "next/navigation";
import { requireRole, requestMeta } from "@/lib/auth";
import { loadGuildDoc, publishGuild, PublishConflictError } from "@/lib/guild-doc";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import GuildView from "@/components/viewer/guild-view";

export const dynamic = "force-dynamic";

export default async function PreviewGuildPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ publish_error?: string }>;
}) {
  await requireRole("ADMIN", "TECH");
  const { id } = await props.params;
  const { publish_error } = await props.searchParams;
  const doc = await loadGuildDoc(id);
  if (!doc) notFound();

  // Publish straight from the preview, so admins don't have to open the editor
  // just to make a checked-over draft live.
  async function publishAction() {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    try {
      await publishGuild(id, u.id);
    } catch (e) {
      if (e instanceof PublishConflictError) {
        redirect(`/preview/${id}?publish_error=conflict`);
      }
      throw e;
    }
    redirect(`/preview/${id}`);
  }

  // Take a live guide back to DRAFT (mirrors the editor's unpublish).
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
    redirect(`/preview/${id}`);
  }

  const isPublished = doc.status === "PUBLISHED";
  const isArchived = doc.status === "ARCHIVED";

  return (
    <main className="min-h-screen bg-zinc-900 px-4 py-6">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center gap-3 rounded-md bg-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <span
          className={`rounded px-2 py-0.5 font-medium ${
            isPublished
              ? "bg-emerald-500/15 text-emerald-300"
              : isArchived
                ? "bg-zinc-600/40 text-zinc-300"
                : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {doc.status.toLowerCase()}
        </span>
        <span>Preview — exactly what an installer sees (their copy also carries a personal watermark)</span>
        <div className="ml-auto flex items-center gap-2">
          {!isPublished && !isArchived && (
            <form action={publishAction}>
              <button className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500">
                Publish
              </button>
            </form>
          )}
          {isPublished && (
            <form action={unpublishAction}>
              <button className="rounded-md border border-zinc-600 px-3 py-1.5 text-zinc-200 hover:bg-zinc-700">
                ↩ Unpublish (back to draft)
              </button>
            </form>
          )}
          <a
            href={`/guides/${id}/edit`}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-zinc-200 hover:bg-zinc-700"
          >
            Edit
          </a>
        </div>
      </div>

      {publish_error === "conflict" && (
        <div className="mx-auto mb-4 max-w-3xl rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Another <strong>published</strong> guide already exists for this exact
          vehicle + product identity. Unpublish or change that one&apos;s
          identity before publishing this draft.
        </div>
      )}

      <GuildView doc={doc} theme="dark" />
    </main>
  );
}
