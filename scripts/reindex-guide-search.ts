/**
 * Rebuild the guide search index from scratch.
 *
 *   npm run search:reindex
 *
 * Safe to run any time: GuideSearchDoc is a mirror of guide content, so this
 * only ever rewrites rows it owns. Run it after the first deploy, after a bulk
 * import, or any time you suspect the index has fallen behind.
 */
import { prisma } from "../src/lib/db";
import { reindexAllGuides } from "../src/lib/guide-search";

async function main() {
  const started = Date.now();
  console.log("Reindexing guide search…");
  const { guides, rows } = await reindexAllGuides((done, total, title) => {
    if (done === total || done % 10 === 0) {
      console.log(`  ${done}/${total}  ${title}`);
    }
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nDone: ${guides} guide(s) → ${rows} searchable section(s) in ${secs}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
