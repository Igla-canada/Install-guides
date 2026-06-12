import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadTaxonomy } from "@/lib/taxonomy";
import { prisma } from "@/lib/db";
import { z } from "zod";
import NewGuildForm from "./new-guild-form";

const createSchema = z.object({
  regionId: z.string().min(1),
  makeId: z.string().min(1),
  modelId: z.string().min(1),
  generationId: z.string().min(1),
  trimId: z.string().optional(),
  iglaProductId: z.string().min(1),
  title: z.string().min(1),
});

async function createGuildAction(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN", "TECH");
  const parsed = createSchema.parse({
    regionId: formData.get("regionId"),
    makeId: formData.get("makeId"),
    modelId: formData.get("modelId"),
    generationId: formData.get("generationId"),
    trimId: formData.get("trimId") || undefined,
    iglaProductId: formData.get("iglaProductId"),
    title: formData.get("title"),
  });

  const guild = await prisma.guild.create({
    data: {
      regionId: parsed.regionId,
      makeId: parsed.makeId,
      modelId: parsed.modelId,
      generationId: parsed.generationId,
      trimId: parsed.trimId ?? null,
      iglaProductId: parsed.iglaProductId,
      title: parsed.title,
      status: "DRAFT",
      createdById: user.id,
      updatedById: user.id,
      sections: {
        create: [
          { order: 0, title: "Installation point", type: "installation_point" },
          { order: 1, title: "Connections", type: "connections" },
          { order: 2, title: "Settings", type: "settings" },
        ],
      },
    },
  });
  redirect(`/guilds/${guild.id}`);
}

export default async function NewGuildPage() {
  await requireRole("ADMIN", "TECH");
  const taxonomy = await loadTaxonomy();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">New guild</h1>
      <p className="mt-1 text-sm text-zinc-500">
        The identity below is what the Igla app matches against — it is
        dropdown-only on purpose. Missing make/model/generation? Add it under{" "}
        <a href="/taxonomy" className="underline">
          Taxonomy
        </a>{" "}
        first.
      </p>
      <NewGuildForm taxonomy={taxonomy} action={createGuildAction} />
    </div>
  );
}
