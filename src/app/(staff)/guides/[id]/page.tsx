// Clicking a guild shows the PREVIEW (what installers see) as the main view,
// with an Edit button into the authoring editor and a per-guide Share panel.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadGuildDoc, duplicateGuild, publishGuild, PublishConflictError } from "@/lib/guild-doc";
import { createAccessGrant, EXPIRY_OPTIONS } from "@/lib/grants";
import GuildView from "@/components/viewer/guild-view";
import GrantPanel from "@/components/guides/grant-panel";

export const dynamic = "force-dynamic";

export default async function GuildPreviewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; label?: string; publish_error?: string }>;
}) {
  const user = await requireRole("ADMIN", "TECH");
  const { id } = await props.params;
  const { created, label, publish_error } = await props.searchParams;
  const doc = await loadGuildDoc(id);
  if (!doc) notFound();

  // Existing users an admin can share this guide with (prefills the link form).
  const shareUsers = await prisma.userAccount.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, phone: true, email: true, role: true },
  });

  const baseUrl = process.env.APP_BASE_URL ?? "";

  // Create a one-time access link scoped to THIS guide.
  async function shareAction(formData: FormData) {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    const granteeLabel = String(formData.get("granteeLabel") ?? "").trim();
    const maxViewsRaw = String(formData.get("maxViews") ?? "").trim();
    const token = await createAccessGrant({
      userId: u.id,
      granteeLabel,
      granteePhone: String(formData.get("granteePhone") ?? "").trim(),
      granteeEmail: String(formData.get("granteeEmail") ?? "").trim() || null,
      hours: Number(formData.get("hours") ?? 24),
      maxViews: maxViewsRaw ? parseInt(maxViewsRaw, 10) : null,
      guildIds: [id],
    });
    redirect(
      `/guides/${id}?created=${encodeURIComponent(token)}&label=${encodeURIComponent(granteeLabel)}`
    );
  }

  // Duplicate the whole structure into a new DRAFT and open it for editing.
  async function duplicateAction() {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    const newId = await duplicateGuild(id, u.id);
    redirect(`/guides/${newId}/edit`);
  }

  // Publish straight from this preview, so admins don't have to open the editor
  // just to make a checked-over draft live.
  async function publishAction() {
    "use server";
    const u = await requireRole("ADMIN", "TECH");
    try {
      await publishGuild(id, u.id);
    } catch (e) {
      if (e instanceof PublishConflictError) {
        redirect(`/guides/${id}?publish_error=conflict`);
      }
      throw e;
    }
    redirect(`/guides/${id}`);
  }

  const statusClass =
    doc.status === "PUBLISHED"
      ? "bg-green-100 text-green-800"
      : doc.status === "DRAFT"
      ? "bg-amber-100 text-amber-800"
      : "bg-zinc-200 text-zinc-600";

  return (
    <div>
      {/* Staff action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/guides" className="text-sm text-zinc-500 hover:underline">
          ← Guides
        </Link>
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass}`}>
          {doc.status.toLowerCase()}
        </span>
        <span className="text-sm text-zinc-400">
          Preview — what the installer sees
        </span>
        <div className="ml-auto flex items-center gap-2">
          {doc.status === "PUBLISHED" ? (
            <GrantPanel
              action={shareAction}
              created={created}
              label={label}
              link={created ? `${baseUrl}/g/${created}` : undefined}
              expiryOptions={EXPIRY_OPTIONS}
              users={shareUsers}
            />
          ) : doc.status === "DRAFT" ? (
            <form action={publishAction}>
              <button
                type="submit"
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
                title="Make this draft live — then it can be shared and served to installers"
              >
                ✓ Publish
              </button>
            </form>
          ) : (
            <span className="text-xs text-zinc-400" title="Restore from the editor before publishing">
              Archived
            </span>
          )}
          <Link
            href={`/export/pdf?ids=${id}`}
            target="_blank"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
            title="Internal export — installer-facing views never offer downloads"
          >
            ⬇ PDF
          </Link>
          <form action={duplicateAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
              title="Create a new draft with the same sections, blocks and identity — fastest way to build a consistent guide"
            >
              ⧉ Duplicate
            </button>
          </form>
          <Link
            href={`/guides/${id}/edit`}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            ✎ Edit
          </Link>
        </div>
      </div>

      {publish_error === "conflict" && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Another <strong>published</strong> guide already exists for this exact
          vehicle + product identity. Unpublish or change that one&apos;s
          identity before publishing this draft.
        </div>
      )}

      {/* Installer-eye preview (dark, exactly as served — minus the per-view watermark) */}
      <div className="mt-4 rounded-xl bg-zinc-900 px-4 py-6">
        <GuildView doc={doc} theme="dark" />
      </div>
    </div>
  );
}
