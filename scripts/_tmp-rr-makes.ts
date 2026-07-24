import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  const makes = await p.make.findMany({
    where: {
      OR: [
        { name: { contains: "Rolls", mode: "insensitive" } },
        { name: { contains: "Royce", mode: "insensitive" } },
      ],
    },
    include: {
      _count: { select: { guilds: true, models: true } },
    },
    orderBy: { name: "asc" },
  });

  console.log("MAKE ROWS:");
  for (const m of makes) {
    console.log(`  id=${m.id} name="${m.name}" models=${m._count.models} guilds=${m._count.guilds}`);
  }

  const drafts = await p.guild.findMany({
    where: {
      status: "DRAFT",
      title: { contains: "Rolls", mode: "insensitive" },
    },
    include: { make: true, model: true },
    orderBy: { title: "asc" },
  });

  console.log("\nDRAFT GUIDES:");
  for (const g of drafts) {
    console.log(`  ${g.title}`);
    console.log(`    make="${g.make.name}" (${g.make.id}) model="${g.model.name}"`);
  }

  const published = await p.guild.findMany({
    where: {
      status: "PUBLISHED",
      make: { name: { contains: "Rolls", mode: "insensitive" } },
    },
    include: { make: true, model: true },
    take: 15,
    orderBy: { title: "asc" },
  });

  console.log("\nSAMPLE PUBLISHED UNDER ROLLS*:");
  for (const g of published) {
    console.log(`  [${g.status}] ${g.title} — make="${g.make.name}"`);
  }

  await p.$disconnect();
}

main();
