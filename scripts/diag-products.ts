import { prisma } from "../src/lib/db";
async function main() {
  const lines = await prisma.productLine.findMany({ include: { products: true }, orderBy: { name: "asc" } });
  console.log("=== Product lines & products (IGLA Types) ===");
  for (const l of lines) {
    console.log(`- ${l.name}:`, l.products.map((p) => `${p.name}${p.modelCode ? ` [code:${p.modelCode}]` : ""}`).join(", "));
  }
  const invCount = await prisma.inventoryUnit.count();
  console.log("\nInternal InventoryUnit rows (serial->product):", invCount);

  console.log("\n=== Published guilds: vehicle + IGLA Type(s) ===");
  const guilds = await prisma.guild.findMany({
    where: { status: "PUBLISHED" },
    include: {
      make: true, model: true, generation: true,
      iglaProduct: { include: { productLine: true } },
      products: { include: { iglaProduct: { include: { productLine: true } } } },
    },
  });
  for (const g of guilds) {
    const prods = g.products.map((p) => `${p.iglaProduct.productLine.name} ${p.iglaProduct.name}`);
    console.log(`- ${g.make.name} ${g.model.name} ${g.generation.name} :: primary=${g.iglaProduct.productLine.name} ${g.iglaProduct.name} :: covers=[${prods.join(", ")}]`);
  }
}
main().then(()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1);});
