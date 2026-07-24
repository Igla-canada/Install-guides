/**
 * Seed / refresh VehicleCompatibility from existing guides (READ-ONLY on Guild).
 * Never creates, edits, publishes, or deletes guides.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/seed-vehicle-compatibility.ts
 *   npx tsx --env-file=.env scripts/seed-vehicle-compatibility.ts --force
 *   npx tsx --env-file=.env scripts/seed-vehicle-compatibility.ts --refresh
 *     → update iglaProducts + sourceGuideStatus on rows that already have sourceGuideId
 */
import { PrismaClient } from "@prisma/client";
import { expandIglaProducts } from "../src/lib/vehicle-compatibility";

const prisma = new PrismaClient();
const force = process.argv.includes("--force");
const refresh = process.argv.includes("--refresh");

type Props = Record<string, string>;

function propsOf(raw: unknown): Props {
  if (!raw || typeof raw !== "object") return {};
  const out: Props = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

async function main() {
  // READ-ONLY query of guides — no writes to Guild / Section / Block.
  const guilds = await prisma.guild.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      properties: true,
      make: { select: { name: true } },
      model: { select: { name: true } },
      trim: { select: { name: true } },
      generation: { select: { yearStart: true, yearEnd: true, name: true } },
      iglaProduct: { select: { name: true } },
      products: { select: { iglaProduct: { select: { name: true } } } },
    },
    orderBy: [{ make: { name: "asc" } }, { model: { name: "asc" } }],
  });

  if (refresh) {
    let updated = 0;
    for (const g of guilds) {
      const productNames = [
        g.iglaProduct.name,
        ...g.products.map((p) => p.iglaProduct.name),
      ];
      const iglaProducts = expandIglaProducts(productNames);
      const yearFrom = g.generation.yearStart;
      // null yearEnd on the guide ⇒ open-ended (“through present”) on compatibility
      const yearTo = g.generation.yearEnd;
      const res = await prisma.vehicleCompatibility.updateMany({
        where: { sourceGuideId: g.id },
        data: {
          iglaProducts,
          sourceGuideStatus: g.status,
          yearFrom,
          yearTo,
        },
      });
      if (res.count) {
        updated += res.count;
        const years =
          yearTo == null ? `${yearFrom}–present` : `${yearFrom}–${yearTo}`;
        console.log(
          `↻ ${g.make.name} ${g.model.name} ${years} → ${iglaProducts.join(" · ") || "—"} [${g.status}]`
        );
      }
    }
    console.log(`Refresh done. updated=${updated}. Guides were not modified.`);
    return;
  }

  const existing = await prisma.vehicleCompatibility.count();
  if (existing > 0 && !force) {
    console.log(
      `Already have ${existing} compatibility record(s). Pass --force to add missing ones, or --refresh to update IGLA products + guide status on existing source-linked rows.`
    );
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const g of guilds) {
    const already = await prisma.vehicleCompatibility.findFirst({
      where: { sourceGuideId: g.id },
      select: { id: true },
    });
    if (already) {
      skipped++;
      continue;
    }

    const props = propsOf(g.properties);
    const yearFrom = g.generation.yearStart;
    // Keep null when the guide has no end year → covered through present.
    const yearTo = g.generation.yearEnd;
    const engineType = props.Fuel || props["Engine Type"] || null;
    const transmissionType = props["Ignition Type"] || props.Transmission || null;
    const productNames = [
      g.iglaProduct.name,
      ...g.products.map((p) => p.iglaProduct.name),
    ];
    const iglaProducts = expandIglaProducts(productNames);

    await prisma.vehicleCompatibility.create({
      data: {
        make: g.make.name,
        model: g.model.name,
        yearFrom,
        yearTo,
        trim: g.trim?.name ?? null,
        engineType,
        transmissionType,
        analogBlockRequired: false,
        additionalBlockRequired: false,
        dealerNotes: null,
        installationNotes: `Seeded from guide “${g.title}” (${g.status}). Blocking fields need admin review.`,
        internalAdminNotes: `sourceGuideId=${g.id}; guide status snapshot ${g.status} (does not control the guide).`,
        isVisibleToDealers: true,
        iglaProducts,
        sourceGuideId: g.id,
        sourceGuideStatus: g.status,
      },
    });
    created++;
    console.log(
      `+ ${g.make.name} ${g.model.name} ${iglaProducts.join(" · ") || "—"} [${g.status}]`
    );
  }

  console.log(`Done. created=${created} skipped=${skipped} (guides scanned=${guilds.length})`);
  console.log("Guides were not modified.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
