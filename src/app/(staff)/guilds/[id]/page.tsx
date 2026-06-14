// Clicking a guild shows the PREVIEW (what installers see) as the main view,
// with an Edit button into the authoring editor.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadGuildDoc } from "@/lib/guild-doc";
import GuildView from "@/components/viewer/guild-view";

export const dynamic = "force-dynamic";

export default async function GuildPreviewPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN", "TECH");
  const { id } = await props.params;
  const doc = await loadGuildDoc(id);
  if (!doc) notFound();

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
        <Link href="/guilds" className="text-sm text-zinc-500 hover:underline">
          ← Guides
        </Link>
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass}`}>
          {doc.status.toLowerCase()}
        </span>
        <span className="text-sm text-zinc-400">
          Preview — what the installer sees
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/export/pdf?ids=${id}`}
            target="_blank"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
            title="Internal export — installer-facing views never offer downloads"
          >
            ⬇ PDF
          </Link>
          <Link
            href={`/guilds/${id}/edit`}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            ✎ Edit
          </Link>
        </div>
      </div>

      {/* Installer-eye preview (dark, exactly as served — minus the per-view watermark) */}
      <div className="mt-4 rounded-xl bg-zinc-900 px-4 py-6">
        <GuildView doc={doc} theme="dark" />
      </div>
    </div>
  );
}
