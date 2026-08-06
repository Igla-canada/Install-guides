/**
 * Set gallery blocks with 3 or 4 columns down to 2 (better on phones).
 * Usage: npx tsx --env-file=.env scripts/fix-gallery-columns.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type GalleryContent = { columns?: number; items?: unknown[]; kind?: string };

async function main() {
  const blocks = await prisma.block.findMany({
    where: { type: "gallery" },
    select: {
      id: true,
      content: true,
      section: {
        select: {
          guild: { select: { id: true, title: true } },
        },
      },
    },
  });

  let updated = 0;
  const byGuide = new Map<string, { title: string; count: number }>();

  for (const b of blocks) {
    const c = b.content as GalleryContent;
    const cols = Number(c.columns ?? 2);
    if (cols < 3) continue;

    await prisma.block.update({
      where: { id: b.id },
      data: {
        content: { ...c, columns: 2 },
      },
    });
    updated++;

    const g = b.section.guild;
    const prev = byGuide.get(g.id);
    byGuide.set(g.id, {
      title: g.title,
      count: (prev?.count ?? 0) + 1,
    });
  }

  console.log(`Updated ${updated} gallery block(s) from 3–4 columns → 2.`);
  if (byGuide.size) {
    console.log("\nGuides touched:");
    for (const [, { title, count }] of [...byGuide.entries()].sort((a, b) =>
      a[1].title.localeCompare(b[1].title),
    )) {
      console.log(`  · ${title} (${count} block${count === 1 ? "" : "s"})`);
    }
  } else {
    console.log("No gallery blocks with 3+ columns found.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
