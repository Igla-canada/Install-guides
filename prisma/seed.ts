import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // --- Region ---
  const canada = await prisma.region.upsert({
    where: { name: "Canada" },
    update: {},
    create: { name: "Canada" },
  });

  // --- Product lines + a starter catalog (replace with the real Compass/IGLA
  // catalog when the owner provides it — open item #3) ---
  const igla = await prisma.productLine.upsert({
    where: { name: "IGLA" },
    update: {},
    create: { name: "IGLA" },
  });
  const compass = await prisma.productLine.upsert({
    where: { name: "Compass" },
    update: {},
    create: { name: "Compass" },
  });

  for (const [lineId, name, modelCode] of [
    [igla.id, "IGLA Alarm", "IGLA-ALARM"],
    [igla.id, "IGLA 251", "IGLA-251"],
    [compass.id, "Compass GPS", "COMPASS-GPS"],
  ] as const) {
    await prisma.iglaProduct.upsert({
      where: { productLineId_name: { productLineId: lineId, name } },
      update: {},
      create: { productLineId: lineId, name, modelCode },
    });
  }

  // --- Sample taxonomy: BMW 4 Series II (matches the reference page) ---
  const bmw = await prisma.make.upsert({
    where: { name: "BMW" },
    update: {},
    create: { name: "BMW" },
  });
  const fourSeries = await prisma.model.upsert({
    where: { makeId_name: { makeId: bmw.id, name: "4 Series" } },
    update: {},
    create: { makeId: bmw.id, name: "4 Series" },
  });
  await prisma.generation.upsert({
    where: { modelId_name: { modelId: fourSeries.id, name: "II (G22)" } },
    update: {},
    create: {
      modelId: fourSeries.id,
      name: "II (G22)",
      yearStart: 2020,
      yearEnd: null,
    },
  });

  // Aliases that normalize common free-text spellings from the Igla portal.
  const aliasRows: Array<{ alias: string; modelId?: string }> = [
    { alias: "bmw" },
    { alias: "4 series", modelId: fourSeries.id },
    { alias: "4-series", modelId: fourSeries.id },
    { alias: "4series", modelId: fourSeries.id },
    { alias: "4er", modelId: fourSeries.id },
  ];
  for (const row of aliasRows) {
    const exists = await prisma.vehicleAlias.findFirst({
      where: { makeId: bmw.id, modelId: row.modelId ?? null, aliasText: row.alias },
    });
    if (!exists) {
      await prisma.vehicleAlias.create({
        data: {
          makeId: bmw.id,
          modelId: row.modelId ?? null,
          aliasText: row.alias,
          source: "seed",
        },
      });
    }
  }

  // --- Admin account ---
  // Only created when NO admin exists yet (fresh database). Never re-creates
  // a default-password account on a live system that already has admins.
  const existingAdmin = await prisma.userAccount.findFirst({
    where: { role: "ADMIN" },
  });
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@igla.local";
  if (existingAdmin) {
    console.log(`Admin already exists (${existingAdmin.email}) — skipping admin creation.`);
  } else {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "igla-admin-2026";
    await prisma.userAccount.create({
      data: {
        email: adminEmail,
        name: "Admin",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(adminPassword, 12),
      },
    });
    console.log(`Seed complete. Admin login: ${adminEmail} / ${adminPassword}`);
  }
  console.log(`Region: ${canada.name}. Product lines: IGLA, Compass.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
