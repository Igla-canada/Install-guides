/**
 * Reset White-red I/O wire direction (and function) to LIN where it was changed.
 * Usage: npx tsx --env-file=.env scripts/fix-white-red-lin.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type IoControl = {
  type: "io";
  direction?: { value?: string | null; options?: { id: string; label: string }[] };
  func?: { value?: string | null; options?: { id: string; label: string }[] };
};

type IglaSettings = {
  sections?: { rows?: { id: string; label: string; control?: IoControl }[] }[];
};

const LIN_OPTION = { id: "lin", label: "LIN" };

function patchWhiteRed(content: IglaSettings): { next: IglaSettings; changed: boolean } {
  let changed = false;
  const next = structuredClone(content);

  for (const sec of next.sections ?? []) {
    for (const row of sec.rows ?? []) {
      if (row.id !== "io_white_red" && row.label?.trim().toLowerCase() !== "white-red") {
        continue;
      }
      const c = row.control;
      if (c?.type !== "io") continue;

      const needsFix = c.direction?.value !== "lin" || c.func?.value !== "lin";
      if (!needsFix) continue;

      c.direction = { ...c.direction, value: "lin" };
      c.func = { ...c.func, value: "lin" };
      changed = true;

      const funcOpts = c.func?.options ?? [];
      if (!funcOpts.some((o) => o.id === "lin")) {
        c.func = { ...c.func, options: [LIN_OPTION, ...funcOpts] };
        changed = true;
      }
    }
  }

  return { next, changed };
}

async function main() {
  const blocks = await prisma.block.findMany({
    where: { type: "igla_settings" },
    select: {
      id: true,
      content: true,
      section: {
        select: {
          guild: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
    },
  });

  let updated = 0;
  const log: string[] = [];

  for (const b of blocks) {
    const content = b.content as IglaSettings;
    const { next, changed } = patchWhiteRed(content);
    if (!changed) continue;

    await prisma.block.update({
      where: { id: b.id },
      data: { content: next },
    });

    updated++;
    const g = b.section.guild;
    log.push(`${g.title} (${g.status}) — guild ${g.id}, block ${b.id}`);
  }

  console.log(`Updated ${updated} igla_settings block(s).\n`);
  for (const line of log.sort()) console.log(`- ${line}`);
  if (updated === 0) console.log("Nothing to change — all White-red wires already LIN.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
