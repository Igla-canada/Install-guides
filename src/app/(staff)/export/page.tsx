// Admin/tech bulk PDF export: pick one or many guides, download as PDF.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ExportSelector from "@/components/export/export-selector";

export default async function ExportPage() {
  await requireRole("ADMIN", "TECH");
  const guilds = await prisma.guild.findMany({
    where: { status: { in: ["PUBLISHED", "DRAFT"] } },
    orderBy: [{ make: { name: "asc" } }, { model: { name: "asc" } }],
    include: {
      make: true,
      model: true,
      generation: true,
      iglaProduct: { include: { productLine: true } },
    },
  });

  // Last PDF export per guide (from the audit log).
  const exportRows = await prisma.auditEvent.groupBy({
    by: ["guildId"],
    where: { action: "pdf_download", guildId: { in: guilds.map((g) => g.id) } },
    _max: { ts: true },
  });
  const lastExport = new Map(
    exportRows.map((r) => [r.guildId, r._max.ts?.toISOString() ?? null])
  );

  const items = guilds.map((g) => ({
    id: g.id,
    title: g.title,
    sub: `${g.make.name} ${g.model.name} ${g.generation.name} · ${g.iglaProduct.productLine.name} ${g.iglaProduct.name}`,
    status: g.status,
    createdAt: g.createdAt.toISOString(),
    lastExportedAt: lastExport.get(g.id) ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Export guides as PDF</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Pick one or more guides and download them as a single PDF. This is the
        internal/admin export — installers never get downloadable files.
      </p>
      <div className="mt-4">
        <ExportSelector items={items} />
      </div>
    </div>
  );
}
