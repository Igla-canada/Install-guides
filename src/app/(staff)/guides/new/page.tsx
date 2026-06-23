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
  // Optional variant label. Set it to make a SEPARATE guide for the same
  // model + years (e.g. "Lightning") — it becomes a distinct generation so the
  // two guides don't collide; the portal then offers both as a chooser.
  variant: z.string().max(60).optional(),
  iglaProductIds: z.array(z.string().min(1)).min(1),
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
    variant: String(formData.get("variant") ?? "").trim() || undefined,
    iglaProductIds: formData.getAll("iglaProductIds").map(String).filter(Boolean),
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

  // Pick (or create) the generation this guide belongs to.
  const upper = parsed.yearTo ?? parsed.yearFrom;
  const variant = parsed.variant?.trim();
  let generation;
  if (variant) {
    // A named variant ("Lightning", "EV", …) is its OWN generation so a second
    // guide can exist for the same model + years. Reuse the variant if it's
    // already there, else create it. Years can overlap other generations.
    generation =
      (await prisma.generation.findFirst({
        where: { modelId: model.id, name: { equals: variant, mode: "insensitive" } },
      })) ??
      (await prisma.generation.create({
        data: { modelId: model.id, name: variant, yearStart: parsed.yearFrom, yearEnd: parsed.yearTo ?? null },
      }));
  } else {
    // Plain guide: reuse the TIGHTEST-fitting generation that covers the year
    // (so it won't accidentally grab a wider/variant generation), else create
    // a year-range one.
    const covering = await prisma.generation.findMany({
      where: {
        modelId: model.id,
        yearStart: { lte: parsed.yearFrom },
        OR: [{ yearEnd: null }, { yearEnd: { gte: upper } }],
      },
    });
    const span = (g: { yearStart: number; yearEnd: number | null }) =>
      (g.yearEnd ?? 9999) - g.yearStart;
    covering.sort((a, b) => span(a) - span(b) || b.yearStart - a.yearStart);
    generation =
      covering[0] ??
      (await prisma.generation.create({
        data: {
          modelId: model.id,
          name: parsed.yearTo ? `${parsed.yearFrom}–${parsed.yearTo}` : `${parsed.yearFrom}+`,
          yearStart: parsed.yearFrom,
          yearEnd: parsed.yearTo ?? null,
        },
      }));
  }

  const region = await prisma.region.findFirstOrThrow();
  const found = await prisma.iglaProduct.findMany({
    where: { id: { in: parsed.iglaProductIds } },
    include: { productLine: true },
  });
  // Keep the order the user ticked; first is the primary (display/title default).
  const products = parsed.iglaProductIds
    .map((id) => found.find((p) => p.id === id))
    .filter((p): p is (typeof found)[number] => Boolean(p));
  if (products.length === 0) throw new Error("pick at least one product");
  const primary = products[0];

  const guild = await prisma.guild.create({
    data: {
      regionId: region.id,
      makeId: make.id,
      modelId: model.id,
      generationId: generation.id,
      trimId: null,
      iglaProductId: primary.id,
      title: parsed.title,
      status: "DRAFT",
      createdById: user.id,
      updatedById: user.id,
      products: { create: products.map((p) => ({ iglaProductId: p.id })) },
      // Reference-page properties box, pre-filled from identity.
      properties: {
        Years: parsed.yearTo ? `${parsed.yearFrom}–${parsed.yearTo}` : `${parsed.yearFrom}`,
        "IGLA Type": products.map((p) => p.name).join(", "),
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
  redirect(`/guides/${guild.id}/edit`);
}

export default async function NewGuildPage() {
  await requireRole("ADMIN", "TECH");
  const taxonomy = await loadTaxonomy();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">New guide</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Type the car and pick the product — that&apos;s it. New makes, models
        and year ranges are created automatically.
      </p>
      <NewGuildForm taxonomy={taxonomy} action={createGuildAction} />
    </div>
  );
}
