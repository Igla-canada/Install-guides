// Loads the full taxonomy tree for dropdown-driven identity selection.
// Identity fields must stay dropdown-only (AGENTS.md #1).
import { prisma } from "./db";

export async function loadTaxonomy() {
  const [makes, regions, productLines] = await Promise.all([
    prisma.make.findMany({
      orderBy: { name: "asc" },
      include: {
        models: {
          orderBy: { name: "asc" },
          include: {
            generations: {
              orderBy: { yearStart: "asc" },
              include: { trims: { orderBy: { name: "asc" } } },
            },
          },
        },
      },
    }),
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.productLine.findMany({
      orderBy: { name: "asc" },
      include: { products: { orderBy: { name: "asc" } } },
    }),
  ]);
  return { makes, regions, productLines };
}

export type Taxonomy = Awaited<ReturnType<typeof loadTaxonomy>>;
