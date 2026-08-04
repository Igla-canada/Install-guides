/**
 * Phase 0 — compatibility-list audit. READ-ONLY: this script never writes.
 *
 *   npm run compat:audit            # table to stdout
 *   npm run compat:audit -- --csv   # also write compat-audit-*.csv files
 *   npm run compat:audit -- --make=Dodge
 *
 * The compatibility list is a denormalised mirror of the guides. This reports
 * every way the mirror can be out of step, so the true scale is known before
 * anything is changed:
 *
 *   1 published guides with no row          (the main hole — sync can't create)
 *   2 rows with no sourceGuideId            (manual / seeded coverage)
 *   3 rows whose guide no longer exists     (orphans)
 *   4 rows whose copied fields have drifted from the live guide
 *   5 duplicate rows for the same make+model+years
 *   6 dealer-visible rows linked to DRAFT guides
 *   7 vehicles where the list disagrees with what resolveGuild() would serve
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { resolveGuild } from "../src/lib/resolve";
import { expandIglaProducts } from "../src/lib/vehicle-compatibility";

const args = process.argv.slice(2);
const wantCsv = args.includes("--csv");
const makeFilter = args.find((a) => a.startsWith("--make="))?.split("=")[1] ?? null;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const sameList = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

function table(title: string, rows: Record<string, unknown>[], limit = 15) {
  console.log(`\n${title}  —  ${rows.length}`);
  if (rows.length === 0) {
    console.log("   none");
    return;
  }
  console.table(rows.slice(0, limit));
  if (rows.length > limit) console.log(`   … and ${rows.length - limit} more`);
}

function csv(name: string, rows: Record<string, unknown>[]) {
  if (!wantCsv || rows.length === 0) return;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const file = `compat-audit-${name}.csv`;
  writeFileSync(file, body, "utf8");
  console.log(`   → ${file}`);
}

async function main() {
  console.log("Compatibility audit — READ ONLY, no writes.");
  if (makeFilter) console.log(`Filtered to make: ${makeFilter}`);

  const guildWhere = makeFilter
    ? { make: { name: { equals: makeFilter, mode: "insensitive" as const } } }
    : {};
  const guilds = await prisma.guild.findMany({
    where: guildWhere,
    select: {
      id: true,
      title: true,
      status: true,
      hideFromCompatibility: true,
      make: { select: { name: true } },
      model: { select: { name: true } },
      trim: { select: { name: true } },
      generation: { select: { yearStart: true, yearEnd: true } },
      iglaProduct: { select: { name: true } },
      products: { select: { iglaProduct: { select: { name: true } } } },
    },
  });

  const rowWhere = makeFilter
    ? { make: { equals: makeFilter, mode: "insensitive" as const } }
    : {};
  const rows = await prisma.vehicleCompatibility.findMany({ where: rowWhere });

  const guildById = new Map(guilds.map((g) => [g.id, g]));
  const rowsByGuide = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.sourceGuideId) continue;
    rowsByGuide.set(r.sourceGuideId, [...(rowsByGuide.get(r.sourceGuideId) ?? []), r]);
  }

  console.log(`\nScope: ${guilds.length} guides, ${rows.length} compatibility rows`);
  const byStatus = guilds.reduce<Record<string, number>>((m, g) => {
    m[g.status] = (m[g.status] ?? 0) + 1;
    return m;
  }, {});
  console.log(`Guides by status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join("  ")}`);

  // 1 — published guides with no row at all -------------------------------
  const missing = guilds
    .filter((g) => g.status === "PUBLISHED" && !(rowsByGuide.get(g.id)?.length))
    .map((g) => ({
      guide: g.title.trim(),
      make: g.make.name,
      model: g.model.name.trim(),
      years: `${g.generation.yearStart}-${g.generation.yearEnd ?? "now"}`,
      guideId: g.id,
    }));
  table("1  PUBLISHED guides with NO compatibility row", missing);
  csv("1-missing-rows", missing);

  // Same for drafts, reported separately (informational).
  const missingDraft = guilds.filter(
    (g) => g.status === "DRAFT" && !(rowsByGuide.get(g.id)?.length)
  ).length;
  console.log(`   (DRAFT guides with no row: ${missingDraft})`);

  // 2 — manual rows (no source guide) --------------------------------------
  const manual = rows
    .filter((r) => !r.sourceGuideId)
    .map((r) => ({
      make: r.make,
      model: r.model.trim(),
      years: `${r.yearFrom}-${r.yearTo ?? "now"}`,
      products: r.iglaProducts.join(", "),
      visible: r.isVisibleToDealers,
      id: r.id,
    }));
  table("2  Rows with NO sourceGuideId (manual / seeded)", manual);
  csv("2-manual-rows", manual);

  // 3 — orphans: guide id set but the guide is gone ------------------------
  // Checked against ALL guides, not the filtered set, so a make filter can't
  // make a live guide look missing.
  const allGuildIds = new Set((await prisma.guild.findMany({ select: { id: true } })).map((g) => g.id));
  const orphans = rows
    .filter((r) => r.sourceGuideId && !allGuildIds.has(r.sourceGuideId))
    .map((r) => ({
      make: r.make,
      model: r.model.trim(),
      years: `${r.yearFrom}-${r.yearTo ?? "now"}`,
      storedStatus: r.sourceGuideStatus,
      visible: r.isVisibleToDealers,
      missingGuideId: r.sourceGuideId,
      id: r.id,
    }));
  table("3  Rows whose source guide NO LONGER EXISTS (orphans)", orphans);
  csv("3-orphan-rows", orphans);

  // 4 — drift between the row and its live guide ---------------------------
  const drift: Record<string, unknown>[] = [];
  for (const [guideId, rs] of rowsByGuide) {
    const g = guildById.get(guideId);
    if (!g) continue; // orphan, covered above
    const liveProducts = expandIglaProducts([
      g.iglaProduct.name,
      ...g.products.map((p) => p.iglaProduct.name),
    ]);
    for (const r of rs) {
      const diffs: string[] = [];
      if (norm(r.make) !== norm(g.make.name)) diffs.push(`make "${r.make}"→"${g.make.name}"`);
      if (norm(r.model) !== norm(g.model.name)) diffs.push(`model "${r.model.trim()}"→"${g.model.name.trim()}"`);
      if (r.yearFrom !== g.generation.yearStart) diffs.push(`yearFrom ${r.yearFrom}→${g.generation.yearStart}`);
      if ((r.yearTo ?? null) !== (g.generation.yearEnd ?? null))
        diffs.push(`yearTo ${r.yearTo ?? "now"}→${g.generation.yearEnd ?? "now"}`);
      if (norm(r.trim) !== norm(g.trim?.name)) diffs.push(`trim "${r.trim ?? ""}"→"${g.trim?.name ?? ""}"`);
      if (!sameList(r.iglaProducts, liveProducts))
        diffs.push(`products [${r.iglaProducts.join(",")}]→[${liveProducts.join(",")}]`);
      if ((r.sourceGuideStatus ?? "") !== g.status)
        diffs.push(`status ${r.sourceGuideStatus ?? "null"}→${g.status}`);
      if (diffs.length) {
        drift.push({
          guide: g.title.trim(),
          make: g.make.name,
          drifted: diffs.length,
          changes: diffs.join(" · ").slice(0, 120),
          rowId: r.id,
        });
      }
    }
  }
  table("4  Rows that have DRIFTED from their live guide", drift);
  csv("4-drift", drift);

  // 5 — duplicate rows for the same vehicle --------------------------------
  const dupMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${norm(r.make)}|${norm(r.model)}|${r.yearFrom}|${r.yearTo ?? "now"}`;
    dupMap.set(k, [...(dupMap.get(k) ?? []), r]);
  }
  const dupes = [...dupMap.entries()]
    .filter(([, rs]) => rs.length > 1)
    .map(([k, rs]) => ({
      vehicle: k.split("|").slice(0, 2).join(" "),
      years: `${rs[0].yearFrom}-${rs[0].yearTo ?? "now"}`,
      rows: rs.length,
      guideLinked: rs.filter((r) => r.sourceGuideId).length,
      manual: rs.filter((r) => !r.sourceGuideId).length,
      statuses: [...new Set(rs.map((r) => r.sourceGuideStatus ?? "manual"))].join("/"),
    }));
  table("5  DUPLICATE rows for the same make+model+years", dupes);
  csv("5-duplicates", dupes);

  // 6 — dealer-visible rows whose guide is a DRAFT -------------------------
  const draftVisible = rows
    .filter((r) => {
      const g = r.sourceGuideId ? guildById.get(r.sourceGuideId) : null;
      return g?.status === "DRAFT" && r.isVisibleToDealers;
    })
    .map((r) => ({
      make: r.make,
      model: r.model.trim(),
      years: `${r.yearFrom}-${r.yearTo ?? "now"}`,
      guide: guildById.get(r.sourceGuideId!)?.title.trim(),
      id: r.id,
    }));
  table("6  Dealer-VISIBLE rows linked to DRAFT guides", draftVisible);
  csv("6-draft-visible", draftVisible);

  // 7 — does the list agree with what would actually be served? ------------
  // For each PUBLISHED guide, ask the resolver for its own vehicle and see
  // whether that guide comes back.
  const disagree: Record<string, unknown>[] = [];
  const published = guilds.filter((g) => g.status === "PUBLISHED");
  for (const g of published) {
    const year = g.generation.yearStart;
    let served: string | null = null;
    try {
      const r = await resolveGuild({ make: g.make.name, model: g.model.name, year });
      served = r.match?.guildId ?? (r.candidates.length === 1 ? r.candidates[0].guildId : null);
      if (served !== g.id) {
        disagree.push({
          guide: g.title.trim(),
          make: g.make.name,
          model: g.model.name.trim(),
          year,
          result:
            r.candidates.length === 0
              ? "NOTHING served"
              : served
                ? `served a DIFFERENT guide (${r.candidates[0]?.title?.trim()})`
                : `ambiguous — ${r.candidates.length} candidates`,
        });
      }
    } catch (e) {
      disagree.push({ guide: g.title.trim(), make: g.make.name, result: `resolver error: ${String(e).slice(0, 60)}` });
    }
  }
  table("7  PUBLISHED guides the resolver does NOT return for their own vehicle", disagree);
  csv("7-resolver-disagreement", disagree);

  // Summary ---------------------------------------------------------------
  console.log("\n──────── SUMMARY ────────");
  console.log(`1 published guides missing a row      : ${missing.length}`);
  console.log(`2 manual rows (no sourceGuideId)      : ${manual.length}`);
  console.log(`3 orphan rows (guide deleted)         : ${orphans.length}`);
  console.log(`4 drifted rows                        : ${drift.length}`);
  console.log(`5 duplicate vehicle groups            : ${dupes.length}`);
  console.log(`6 dealer-visible DRAFT rows           : ${draftVisible.length}`);
  console.log(`7 resolver disagreements              : ${disagree.length}`);
  console.log(`\nrows total ${rows.length} · guides total ${guilds.length}`);
  console.log("No changes were made.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
