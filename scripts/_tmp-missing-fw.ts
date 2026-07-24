import fs from "fs";
import path from "path";

const DATA = "D:\\Ghost Guides Data";
const SW = path.join(DATA, "2026 June Ghost files(2)", "2026 June Ghost files");
const log = JSON.parse(fs.readFileSync(path.join(DATA, "import-log-ghost.json"), "utf8")) as Array<{
  brand: string;
  model: string;
  familyFile?: string | null;
  skipped?: string;
}>;
const manifest = JSON.parse(fs.readFileSync(path.join(DATA, "manifest.json"), "utf8")) as {
  guides: Array<{ brand: string; model: string; ghostType?: string; filePath?: string }>;
};

function listFolders(): string[] {
  const out: string[] = [];
  const ii = path.join(SW, "Ghost-II and Ghost-Pro");
  if (fs.existsSync(ii)) {
    for (const d of fs.readdirSync(ii, { withFileTypes: true })) {
      if (d.isDirectory()) out.push(d.name);
    }
  }
  const fd = path.join(SW, "Ghost-III and Pro FD");
  if (fs.existsSync(fd)) {
    for (const top of fs.readdirSync(fd, { withFileTypes: true })) {
      if (!top.isDirectory()) continue;
      const p = path.join(fd, top.name);
      for (const d of fs.readdirSync(p, { withFileTypes: true })) {
        if (d.isDirectory()) out.push(d.name);
      }
    }
  }
  return out;
}

const folders = listFolders();
const folderLower = new Map(folders.map((f) => [f.toLowerCase(), f]));

function near(fam: string): string[] {
  const raw = fam.trim();
  const strip = raw.replace(/\.bin$/i, "").replace(/\.bin\.bin$/i, "").replace(/_+$/, "");
  const hits = new Set<string>();
  for (const key of [raw, strip]) {
    const hit = folderLower.get(key.toLowerCase());
    if (hit) hits.add(hit);
  }
  // loose contains
  const s = strip.toLowerCase();
  for (const f of folders) {
    const fl = f.toLowerCase();
    if (fl === s) hits.add(f);
    else if (s.length >= 6 && (fl.includes(s) || s.includes(fl))) hits.add(f);
  }
  return [...hits].slice(0, 4);
}

const last = log.slice(-697);
const miss = last.filter((e) => e.skipped?.startsWith("family_folder_missing"));

type Row = {
  brand: string;
  model: string;
  ghostType: string;
  pdfFamily: string;
  onGhostSite: boolean;
  nearFolders: string[];
};

const rows: Row[] = [];
for (const e of miss) {
  const fam = e.familyFile || e.skipped!.replace(/^family_folder_missing:\s*/, "");
  const g =
    manifest.guides.find(
      (x) => x.brand === e.brand && x.model === e.model
    ) ||
    manifest.guides.find(
      (x) =>
        x.brand.toLowerCase() === e.brand.toLowerCase() &&
        x.model.toLowerCase() === e.model.toLowerCase()
    );
  rows.push({
    brand: e.brand,
    model: e.model,
    ghostType: g?.ghostType ?? "?",
    pdfFamily: fam,
    onGhostSite: Boolean(g),
    nearFolders: near(fam),
  });
}

const byBrand = new Map<string, Row[]>();
for (const r of rows) {
  if (!byBrand.has(r.brand)) byBrand.set(r.brand, []);
  byBrand.get(r.brand)!.push(r);
}

console.log(`Total missing software: ${rows.length}`);
console.log(`All have Ghost-site guide in manifest: ${rows.every((r) => r.onGhostSite)}`);
console.log(`With near-match folder in June pack: ${rows.filter((r) => r.nearFolders.length).length}`);
console.log(`No near-match at all: ${rows.filter((r) => !r.nearFolders.length).length}`);
console.log("");

for (const brand of [...byBrand.keys()].sort()) {
  const list = byBrand.get(brand)!;
  console.log(`\n## ${brand} (${list.length})`);
  for (const r of list.sort((a, b) => a.model.localeCompare(b.model))) {
    const near = r.nearFolders.length ? ` ≈ ${r.nearFolders.join(" | ")}` : " ≈ (none in June pack)";
    console.log(`- ${r.model}`);
    console.log(`  Ghost type: ${r.ghostType} | PDF FAMILY FILE: ${r.pdfFamily}${near}`);
  }
}

// Write CSV for user
const csvPath = path.join(DATA, "missing-software-132.csv");
const csv = [
  "brand,model,ghostType,pdfFamilyFile,onGhostSite,nearMatchFolders",
  ...rows.map((r) =>
    [r.brand, r.model, r.ghostType, r.pdfFamily, r.onGhostSite, r.nearFolders.join("; ")]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",")
  ),
].join("\n");
fs.writeFileSync(csvPath, csv);
console.log(`\nWrote ${csvPath}`);
