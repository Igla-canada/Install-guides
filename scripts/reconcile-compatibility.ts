/**
 * Phase 2 — one-shot reconcile of the compatibility list against the guides.
 *
 *   npm run compat:reconcile                      # DRY RUN (default) — no writes
 *   npm run compat:reconcile -- --make=Dodge      # scope to one make
 *   npm run compat:reconcile -- --apply --make=Dodge
 *   npm run compat:reconcile -- --apply           # everything
 *   npm run compat:reconcile -- --apply --delete-orphans
 *
 * Two phases, deliberately separate so a mistake is easy to isolate:
 *   ADDITIVE  — upsert every guide's row from live guide data (safe, idempotent)
 *   DESTRUCTIVE — delete orphan rows, only with --delete-orphans
 *
 * Never touches dealerNotes / internalAdminNotes / isVisibleToDealers: those are
 * human-authored. Re-running changes nothing once clean.
 */
import { prisma } from "../src/lib/db";
import { syncCompatibilityFromGuideDetailed } from "../src/lib/vehicle-compatibility";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const deleteOrphans = args.includes("--delete-orphans");
const makeFilter = args.find((a) => a.startsWith("--make="))?.split("=")[1] ?? null;

async function main() {
  console.log(apply ? "RECONCILE — APPLYING CHANGES" : "RECONCILE — DRY RUN (no writes)");
  if (makeFilter) console.log(`Scoped to make: ${makeFilter}`);
  console.log("");

  const where = makeFilter
    ? { make: { name: { equals: makeFilter, mode: "insensitive" as const } } }
    : {};
  const guilds = await prisma.guild.findMany({
    where,
    select: { id: true, title: true, status: true, make: { select: { name: true } } },
    orderBy: [{ make: { name: "asc" } }, { title: "asc" }],
  });

  const rowsBefore = await prisma.vehicleCompatibility.count();
  const linked = await prisma.vehicleCompatibility.findMany({
    select: { id: true, sourceGuideId: true, make: true, model: true },
  });
  const haveRow = new Set(linked.map((r) => r.sourceGuideId).filter(Boolean) as string[]);

  // ---- ADDITIVE: every guide gets an up-to-date row ----------------------
  const toCreate = guilds.filter((g) => !haveRow.has(g.id));
  const toUpdate = guilds.filter((g) => haveRow.has(g.id));
  console.log(`Guides in scope : ${guilds.length}`);
  console.log(`  rows to CREATE: ${toCreate.length}`);
  console.log(`  rows to UPDATE: ${toUpdate.length}`);
  if (toCreate.length) {
    console.log("\n  Will create rows for:");
    for (const g of toCreate.slice(0, 25)) {
      console.log(`    [${g.status.padEnd(9)}] ${g.make.name} — ${g.title.trim()}`);
    }
    if (toCreate.length > 25) console.log(`    … and ${toCreate.length - 25} more`);
  }

  let created = 0;
  let updated = 0;
  if (apply) {
    console.log("\n  applying…");
    for (const g of guilds) {
      const r = await syncCompatibilityFromGuideDetailed(g.id);
      if (r === "created") created++;
      else if (r === "updated") updated++;
    }
    console.log(`  created ${created}, updated ${updated}`);
  }

  // ---- DESTRUCTIVE: orphan rows ------------------------------------------
  const allGuildIds = new Set(
    (await prisma.guild.findMany({ select: { id: true } })).map((g) => g.id),
  );
  const orphans = linked.filter((r) => r.sourceGuideId && !allGuildIds.has(r.sourceGuideId));
  console.log(`\nOrphan rows (guide deleted): ${orphans.length}`);
  for (const o of orphans.slice(0, 25)) {
    console.log(`    ${o.make} — ${o.model.trim()}`);
  }
  if (orphans.length > 25) console.log(`    … and ${orphans.length - 25} more`);

  let deleted = 0;
  if (orphans.length) {
    if (apply && deleteOrphans) {
      const res = await prisma.vehicleCompatibility.deleteMany({
        where: { id: { in: orphans.map((o) => o.id) } },
      });
      deleted = res.count;
      console.log(`  deleted ${deleted} orphan row(s)`);
    } else {
      console.log(
        deleteOrphans
          ? "  (dry run — would delete these)"
          : "  (kept — pass --delete-orphans to remove them)",
      );
    }
  }

  // ---- Summary -----------------------------------------------------------
  const rowsAfter = await prisma.vehicleCompatibility.count();
  console.log("\n──────── SUMMARY ────────");
  console.log(`rows before : ${rowsBefore}`);
  console.log(`rows after  : ${rowsAfter}  (${rowsAfter - rowsBefore >= 0 ? "+" : ""}${rowsAfter - rowsBefore})`);
  if (apply) {
    console.log(`created ${created} · updated ${updated} · orphans deleted ${deleted}`);
    console.log("\nRe-run the audit to confirm: npm run compat:audit");
  } else {
    console.log(`would create ${toCreate.length} · update ${toUpdate.length}` +
      (deleteOrphans ? ` · delete ${orphans.length} orphans` : ""));
    console.log("\nNothing was written. Re-run with --apply to commit.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
