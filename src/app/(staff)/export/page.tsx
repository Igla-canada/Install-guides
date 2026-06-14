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

  const items = guilds.map((g) => ({
    id: g.id,
    title: g.title,
    sub: `${g.make.name} ${g.model.name} ${g.generation.name} · ${g.iglaProduct.productLine.name} ${g.iglaProduct.name}`,
    status: g.status,
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
