/**
 * Set coords.fontSize = 22 on every on-image label annotation (arrow / box / textbox).
 * Usage: npx tsx scripts/set-annotation-font-default.ts
 */
import { PrismaClient } from "@prisma/client";

const FONT = 22;

const prisma = new PrismaClient();

async function main() {
  // One-shot JSON patch — avoids per-row races if annotations are edited mid-run.
  const result = await prisma.$executeRaw`
    UPDATE "Annotation"
    SET coords = jsonb_set(
      COALESCE(coords::jsonb, '{}'::jsonb),
      '{fontSize}',
      '22'::jsonb,
      true
    )
    WHERE shape IN ('arrow', 'box', 'textbox')
  `;

  const sample = await prisma.annotation.count({
    where: {
      shape: { in: ["arrow", "box", "textbox"] },
    },
  });

  console.log(`Done. rows_touched=${result} label_annotations=${sample} fontSize=${FONT}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
