// Renders the selected guides with fully-inlined images, then a client
// downloader rasterizes them into one PDF. Each export is audit-logged.
import { notFound } from "next/navigation";
import { requireRole, requestMeta } from "@/lib/auth";
import { loadGuildDoc } from "@/lib/guild-doc";
import { logEvent } from "@/lib/audit";
import GuildView from "@/components/viewer/guild-view";
import PdfDownloader from "@/components/export/pdf-downloader";

export const dynamic = "force-dynamic";

function safeName(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "guide";
}

export default async function ExportPdfPage(props: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const user = await requireRole("ADMIN", "TECH");
  const { ids } = await props.searchParams;
  const idList = (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (idList.length === 0) notFound();

  const docs = (await Promise.all(idList.map((id) => loadGuildDoc(id)))).filter(
    (d): d is NonNullable<typeof d> => Boolean(d)
  );
  if (docs.length === 0) notFound();

  // Audit every export, per guide.
  const meta = await requestMeta();
  await Promise.all(
    docs.map((d) =>
      logEvent({
        actor: { userId: user.id },
        guildId: d.id,
        action: "pdf_download",
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { via: "pdf_export", count: docs.length },
      })
    )
  );

  const filename =
    docs.length === 1 ? safeName(docs[0].title) : `igla-guides-${docs.length}`;

  return (
    <div>
      <div className="sticky top-0 z-10 mb-4 flex items-center gap-3 border-b border-zinc-200 bg-white py-2">
        <span className="text-sm text-zinc-500">
          PDF export — {docs.length} guide{docs.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto">
          <PdfDownloader filename={filename} auto={docs.length === 1} />
        </div>
      </div>

      <div className="space-y-8">
        {docs.map((doc) => (
          <div
            key={doc.id}
            data-export-article
            className="mx-auto max-w-3xl rounded-lg bg-white p-6 text-zinc-900 shadow-sm"
          >
            {/* light theme + inlined images so the PDF capture has no taint */}
            <GuildView doc={doc} theme="light" inlineImages />
          </div>
        ))}
      </div>
    </div>
  );
}
