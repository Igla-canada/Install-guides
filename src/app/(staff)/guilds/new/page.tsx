import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadTaxonomy } from "@/lib/taxonomy";
import { prisma } from "@/lib/db";
import { z } from "zod";
import NewGuildForm from "./new-guild-form";

const createSchema = z.object({
  makeName: z.string().min(1),
  modelName: z.string().min(1),
  yearFrom: z.coerce.number().int().min(1950).max(2100),
  yearTo: z.coerce.number().int().min(1950).max(2100).optional(),
  iglaProductId: z.string().min(1),
  title: z.string().min(1),
});

function titleCase(s: string): string {
  // Preserve typed casing for things like "GX 550"/"X5"; only fix all-lowercase words.
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Type-or-pick identity: makes/models/year-ranges are found case-insensitively
// or created on the fly — no taxonomy pre-setup required. The guild still
// stores strict IDs underneath, so the Igla app's auto-pull stays exact.
async function createGuildAction(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN", "TECH");
  const parsed = createSchema.parse({
    makeName: formData.get("makeName"),
    modelName: formData.get("modelName"),
    yearFrom: formData.get("yearFrom"),
    yearTo: String(formData.get("yearTo") ?? "").trim() || undefined,
    iglaProductId: formData.get("iglaProductId"),
    title: formData.get("title"),
  });

  const makeName = titleCase(parsed.makeName);
  const make =
    (await prisma.make.findFirst({
      where: { name: { equals: makeName, mode: "insensitive" } },
    })) ?? (await prisma.make.create({ data: { name: makeName } }));

  const modelName = titleCase(parsed.modelName);
  const model =
    (await prisma.model.findFirst({
      where: { makeId: make.id, name: { equals: modelName, mode: "insensitive" } },
    })) ?? (await prisma.model.create({ data: { makeId: make.id, name: modelName } }));

  // Reuse a year range that covers the input; otherwise create one.
  const upper = parsed.yearTo ?? parsed.yearFrom;
  const generation =
    (await prisma.generation.findFirst({
      where: {
        modelId: model.id,
        yearStart: { lte: parsed.yearFrom },
        OR: [{ yearEnd: null }, { yearEnd: { gte: upper } }],
      },
      orderBy: { yearStart: "desc" },
    })) ??
    (await prisma.generation.create({
      data: {
        modelId: model.id,
        name: parsed.yearTo ? `${parsed.yearFrom}–${parsed.yearTo}` : `${parsed.yearFrom}+`,
        yearStart: parsed.yearFrom,
        yearEnd: parsed.yearTo ?? null,
      },
    }));

  const region = await prisma.region.findFirstOrThrow();
  const product = await prisma.iglaProduct.findUniqueOrThrow({
    where: { id: parsed.iglaProductId },
    include: { productLine: true },
  });

  const guild = await prisma.guild.create({
    data: {
      regionId: region.id,
      makeId: make.id,
      modelId: model.id,
      generationId: generation.id,
      trimId: null,
      iglaProductId: product.id,
      title: parsed.title,
      status: "DRAFT",
      createdById: user.id,
      updatedById: user.id,
      // Reference-page properties box, pre-filled from identity.
      properties: {
        Years: parsed.yearTo ? `${parsed.yearFrom}–${parsed.yearTo}` : `${parsed.yearFrom}`,
        "IGLA Type": product.name.startsWith(product.productLine.name)
          ? product.name
          : `${product.productLine.name} ${product.name}`,
        Status: "Stable",
      },
      sections: {
        create: [
          { order: 0, title: "Connection location(s)", type: "installation_point" },
          {
            order: 1,
            title: "Connections",
            type: "connections",
            blocks: {
              create: [
                {
                  order: 0,
                  type: "connections_table",
                  content: {
                    rows: [
                      { name: "CAN-H", location: "", color: "", pin: "", note: "" },
                      { name: "CAN-L", location: "", color: "", pin: "", note: "" },
                      { name: "Ground", location: "", color: "", pin: "", note: "" },
                      { name: "12V Constant", location: "", color: "", pin: "", note: "" },
                    ],
                  },
                },
              ],
            },
          },
          { order: 2, title: "IGLA Settings", type: "settings" },
          { order: 3, title: "Software", type: "software" },
          { order: 4, title: "Buttons and Indication", type: "buttons_indications" },
        ],
      },
    },
  });
  redirect(`/guilds/${guild.id}/edit`);
}

export default async function NewGuildPage() {
  await requireRole("ADMIN", "TECH");
  const taxonomy = await loadTaxonomy();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">New guild</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Type the car and pick the product — that&apos;s it. New makes, models
        and year ranges are created automatically.
      </p>
      <NewGuildForm taxonomy={taxonomy} action={createGuildAction} />
    </div>
  );
}
