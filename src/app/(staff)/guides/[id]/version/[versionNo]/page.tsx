// Read-only preview of a specific saved version, rendered from its snapshot so
// you can tell v3 from v11 at a glance (not just by number).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import GuildView from "@/components/viewer/guild-view";
import type { GuildDoc } from "@/lib/guild-doc";

export const dynamic = "force-dynamic";

export default async function VersionPreviewPage(props: {
  params: Promise<{ id: string; versionNo: string }>;
}) {
  await requireRole("ADMIN", "TECH");
  const { id, versionNo } = await props.params;
  const no = parseInt(versionNo, 10);

  const version = await prisma.guildVersion.findUnique({
    where: { guildId_versionNo: { guildId: id, versionNo: no } },
    include: { createdBy: { select: { name: true } } },
  });
  if (!version) notFound();

  const snap = version.snapshot as {
    identity: {
      makeId: string;
      modelId: string;
      generationId: string;
      trimId: string | null;
      iglaProductId: string;
      title: string;
    };
    coverImageId: string | null;
    properties: Record<string, string> | null;
    sections: Array<{
      id: string;
      order: number;
      title: string;
      type: string;
      blocks: Array<{ id: string; order: number; type: string; content: unknown }>;
    }>;
  };

  // Resolve the identity names this snapshot referenced by id.
  const [make, model, generation, trim, product] = await Promise.all([
    prisma.make.findUnique({ where: { id: snap.identity.makeId } }),
    prisma.model.findUnique({ where: { id: snap.identity.modelId } }),
    prisma.generation.findUnique({ where: { id: snap.identity.generationId } }),
    snap.identity.trimId
      ? prisma.trim.findUnique({ where: { id: snap.identity.trimId } })
      : Promise.resolve(null),
    prisma.iglaProduct.findUnique({
      where: { id: snap.identity.iglaProductId },
      include: { productLine: true },
    }),
  ]);

  // Build a doc shaped like loadGuildDoc() so GuildView can render it as-is.
  const doc = {
    id,
    title: snap.identity.title,
    status: "PUBLISHED",
    properties: snap.properties,
    coverImageId: snap.coverImageId,
    make: { name: make?.name ?? "—" },
    model: { name: model?.name ?? "—" },
    generation: {
      name: generation?.name ?? "—",
      yearStart: generation?.yearStart ?? 0,
      yearEnd: generation?.yearEnd ?? null,
    },
    trim: trim ? { name: trim.name } : null,
    iglaProduct: {
      name: product?.name ?? "—",
      productLine: { name: product?.productLine.name ?? "—" },
    },
    sections: snap.sections,
  } as unknown as GuildDoc;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/guides/${id}/edit`} className="text-sm text-zinc-500 hover:underline">
          ← Back to editor
        </Link>
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium">
          version {no}
        </span>
        <span className="text-sm text-zinc-400">
          saved {version.createdAt.toLocaleString()} · {version.createdBy.name}
          {version.note ? ` · ${version.note}` : ""}
        </span>
      </div>
      <div className="mt-4 rounded-xl bg-zinc-900 px-4 py-6">
        <GuildView doc={doc} theme="dark" />
      </div>
    </div>
  );
}
