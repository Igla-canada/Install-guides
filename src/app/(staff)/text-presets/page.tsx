import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TextPresetsManager from "@/components/admin/text-presets-manager";

export default async function TextPresetsPage() {
  await requireRole("ADMIN", "TECH");
  const presets = await prisma.textBlockPreset.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Text presets</h1>
      <p className="mt-1 text-sm text-zinc-500">
        These appear in the guide editor under <strong>+ Add block</strong>,
        next to options like Connections table. Choosing one inserts a normal
        text block already filled with this content — still fully editable
        (size, bold, color, bullets, etc.).
      </p>
      <div className="mt-4">
        <TextPresetsManager initial={JSON.parse(JSON.stringify(presets))} />
      </div>
    </div>
  );
}
