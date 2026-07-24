/**
 * Autowatch Ghost → Igla Guides draft importer (local test).
 *
 * Content layout (Ronen 2026-07-18 / updated):
 * - Title header: "{Make} {Model} {Years} V2"; properties Label=V2
 * - Status: "Based on Author Site"; Source=Author-IGLA; Fuel / Ignition Type when known
 * - NEVER override published/site guides — always create new V2 drafts
 * - Ghost-II → mark IGLA 231 + IGLA Alarm; Ghost Pro → Alarm only (still attach igla2_ bins)
 * - Software names all lowercase: igla2_alarm_… / igla2_… / alarm_fd_…
 * - Replace every "Ghost" / "Autowatch" in guide text with "IGLA"
 * - Canada exclusions: canada-exclusions.json / IMPORT-RULES Rule 5
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-ghost.ts --test-luxury --replace
 *   npx tsx --env-file=.env scripts/import-ghost.ts --all
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { s3, BUCKET, ensureBucket } from "../src/lib/s3";

const prisma = new PrismaClient();

const DATA_ROOT = process.env.GHOST_DATA_ROOT ?? "D:\\Ghost Guides Data";
const SOFTWARE_ROOT = path.join(
  DATA_ROOT,
  "2026 June Ghost files(2)",
  "2026 June Ghost files"
);
const SOFTWARE_II_PRO = path.join(SOFTWARE_ROOT, "Ghost-II and Ghost-Pro");
const SOFTWARE_FD = path.join(SOFTWARE_ROOT, "Ghost-III and Pro FD");
const DOWNLOADS = path.join(DATA_ROOT, "downloads");
const MANIFEST = path.join(DATA_ROOT, "manifest.json");
const LOG_PATH = path.join(DATA_ROOT, "import-log-ghost.json");
const PDFJS_PATH =
  process.env.PDFJS_PATH ??
  "C:\\Users\\Ronen CSI\\Desktop\\GHOST GUIDES\\node_modules\\pdfjs-dist\\legacy\\build\\pdf.mjs";
const CANADA_EXCLUSIONS_PATH =
  process.env.CANADA_EXCLUSIONS_PATH ??
  "C:\\Users\\Ronen CSI\\Desktop\\GHOST GUIDES\\canada-exclusions.json";

type CanadaExclusions = {
  excludedBrands: string[];
  brandAliases?: Record<string, string>;
  excludedModels: string[];
  hyundaiAllowlistOnly: string[];
};

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[''`´]/g, "")
    .replace(/[!]+$/g, "")
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadCanadaExclusions(): CanadaExclusions {
  const raw = JSON.parse(fs.readFileSync(CANADA_EXCLUSIONS_PATH, "utf8")) as CanadaExclusions;
  return raw;
}

const CANADA = loadCanadaExclusions();
const EXCLUDED_BRANDS = new Set(CANADA.excludedBrands.map(normKey));
for (const [alias, canon] of Object.entries(CANADA.brandAliases ?? {})) {
  EXCLUDED_BRANDS.add(normKey(alias));
  EXCLUDED_BRANDS.add(normKey(canon));
}
const EXCLUDED_MODELS = CANADA.excludedModels.map(normKey).sort((a, b) => b.length - a.length);
const HYUNDAI_ALLOW = CANADA.hyundaiAllowlistOnly.map(normKey);

function canadaSkipReason(brand: string, model: string): string | null {
  const b = normKey(brand);
  if (EXCLUDED_BRANDS.has(b)) return "canada_excluded_brand";

  const m = normKey(model.replace(/\s*\([^)]*\)\s*$/, ""));

  if (b === "hyundai") {
    const ok = HYUNDAI_ALLOW.some(
      (a) => m === a || m.startsWith(a + " ") || m.includes(" " + a + " ") || m.endsWith(" " + a)
    );
    if (!ok) return "canada_hyundai_not_allowed";
    return null;
  }

  for (const ex of EXCLUDED_MODELS) {
    if (m === ex || m.startsWith(ex + " ") || m.endsWith(" " + ex) || m.includes(" " + ex + " ")) {
      return "canada_excluded_model";
    }
  }
  return null;
}

type ManifestGuide = {
  brand: string;
  model: string;
  title?: string;
  year?: string;
  ghostType?: string;
  filePath?: string;
  vehicleFolder?: string;
  imagesDir?: string;
  images?: { install?: string[]; button?: string[]; vehicle?: string[] };
  recordId?: string;
};

type WireRow = {
  name: string;
  location: string;
  color: string;
  pin: string;
  note: string;
};

type PdfMeta = {
  familyFile: string | null;
  /** FD vehicle config code from PDF, e.g. bmw_x6_3r1e1p1 — critical for Pro-FD. */
  configuration: string | null;
  ghostType: string | null;
  yearRange: string | null;
  connectionPoint: string | null;
  wires: WireRow[];
  importantNotes: string[];
  connectionNotes: string[];
  requiredFeatures: string[];
  optionalFeatures: string[];
  softwareHints: string[];
  buttonLines: string[];
  fuel: string | null;
  ignitionType: string | null;
};

type ImportLogEntry = {
  at: string;
  brand: string;
  model: string;
  familyFile: string | null;
  guildId?: string;
  title?: string;
  products?: string[];
  software?: string[];
  softwarePending?: string | null;
  photosUploaded?: number;
  photosSkipped?: Array<{ file: string; reason: string }>;
  skipped?: string;
  error?: string;
};

/** Public-facing text: never leave Ghost / Autowatch branding. */
function iglaize(s: string): string {
  return s
    .replace(/Autowatch/gi, "IGLA")
    .replace(/Ghost\s*PRO\s*FD/gi, "IGLA FD")
    .replace(/Ghost-III/gi, "IGLA FD")
    .replace(/Ghost\s*III/gi, "IGLA FD")
    .replace(/Ghost\s*Pro/gi, "IGLA Alarm")
    .replace(/Ghost-II/gi, "IGLA 231")
    .replace(/Ghost\s*II/gi, "IGLA 231")
    .replace(/\bGhost\b/gi, "IGLA")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeMake(brand: string): string {
  const b = brand.trim();
  // Site catalog uses space (no hyphen): "Rolls Royce" / "Mercedes Benz"
  if (/^rolls[-\s]?royce$/i.test(b)) return "Rolls Royce";
  if (/^mercedes([-\s]?benz)?$/i.test(b)) return "Mercedes Benz";
  if (/^mclaren$/i.test(b)) return "McLaren";
  return titleCase(b);
}

function parseYears(
  model: string,
  yearField?: string,
  yearRange?: string | null
): { yearFrom: number; yearTo: number | null; label: string } {
  const src = yearRange || yearField || model;
  const m = src.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (m) return { yearFrom: +m[1], yearTo: +m[2], label: `${m[1]}–${m[2]}` };
  const single = src.match(/(\d{4})/);
  if (single) return { yearFrom: +single[1], yearTo: null, label: single[1] };
  const y = new Date().getFullYear();
  return { yearFrom: y, yearTo: null, label: String(y) };
}

function modelBaseName(model: string): string {
  return model.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function isFdGhostType(ghostType: string | null | undefined): boolean {
  const t = (ghostType ?? "").toLowerCase();
  return (
    t.includes("ghost-iii") ||
    t.includes("ghost iii") ||
    t.includes("pro fd") ||
    t.includes("ghost pro fd")
  );
}

/** PDF labels that must never be treated as a CONFIGURATION code. */
const CONFIGURATION_RESERVED = new Set([
  "family",
  "file",
  "year",
  "model",
  "ghost",
  "type",
  "important",
  "range",
  "connection",
  "wires",
  "notes",
  "optional",
  "required",
  "feature",
  "features",
  "programming",
]);

/**
 * FD / Ghost-III vehicle config codes look like bmw_x6_3r1e1p1 / mazda_cx50_1r0e1p1.
 * Reject bare reserved words (e.g. FAMILY from nearby "FAMILY FILE").
 */
function parseConfiguration(flat: string): string | null {
  const raw =
    flat.match(/\bCONFIGURATION\s*[:\-]?\s*([A-Za-z][A-Za-z0-9_+\-.]*)/i)?.[1]?.trim() ?? null;
  if (!raw) return null;
  if (CONFIGURATION_RESERVED.has(raw.toLowerCase())) return null;
  // Require underscore-separated family-style token with at least one digit.
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/i.test(raw)) return null;
  if (!/\d/.test(raw)) return null;
  if (raw.length < 8) return null;
  return raw;
}

function isGhostPro(ghostType: string | null | undefined): boolean {
  const t = (ghostType ?? "").toLowerCase();
  return t.includes("ghost pro") && !isFdGhostType(ghostType);
}

/** Products marked available on the guide (Ghost Pro = Alarm only; Ghost-II = 231+Alarm). */
function productNamesFor(ghostType: string | null | undefined): string[] {
  if (isFdGhostType(ghostType)) return ["IGLA FD"];
  if (isGhostPro(ghostType)) return ["IGLA Alarm"];
  return ["IGLA 231", "IGLA Alarm"];
}

/** Always lowercase Igla firmware names — never leave "ghost" in the filename. */
function renameSoftware(filename: string): string | null {
  const base = path.basename(filename);
  const lower = base.toLowerCase();
  if (lower.includes("_old") || /(?:^|_)old(?:_|\.|$)/i.test(lower)) return null;
  if (lower.startsWith("ghost3") || lower.includes("ghost3_")) return null;
  let out = lower;
  if (out.includes("ghost-pro-fd")) {
    out = out.replace(/ghost-pro-fd/g, "alarm_fd");
  } else if (out.includes("ghost2_alarm")) {
    out = out.replace(/ghost2_alarm/g, "igla2_alarm");
  } else if (out.includes("ghost2_")) {
    out = out.replace(/ghost2_/g, "igla2_");
  }
  out = out.replace(/ghost/g, "igla");
  out = out.replace(/alarm-fd/g, "alarm_fd");
  // Prefer .bin naming in library even when source is .xbin
  out = out.replace(/\.xbin$/i, ".bin");
  return out;
}

function classifyBin(filename: string): "alarm" | "231" | "fd" | "skip" {
  const lower = filename.toLowerCase();
  if (lower.includes("_old")) return "skip";
  if (lower.includes("ghost3")) return "skip";
  if (
    lower.includes("ghost-pro-fd") ||
    lower.includes("alarm-fd") ||
    lower.includes("alarm_fd") ||
    lower.endsWith(".xbin")
  )
    return "fd";
  if (lower.includes("ghost2_alarm") || lower.includes("igla2_alarm")) return "alarm";
  if (lower.includes("ghost2_") || lower.includes("igla2_")) return "231";
  return "skip";
}

function normFamilyToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\.bin|\.xbin)+$/g, "")
    .replace(/_+$/g, "")
    .replace(/\+/g, "")
    // PDF family mzd_* / mid-filename *_mzd_* (old bins after rename)
    .replace(/(^|_)mzd_/g, "$1mazda_")
    .replace(/(^|_)hnd_/g, "$1honda_")
    .replace(/[^a-z0-9_]/g, "");
}

/** PDF FAMILY FILE often ends with .bin even when the June pack folder does not. */
function familyLookupNames(family: string): string[] {
  const tokens = family
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+or\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const names: string[] = [];
  for (const raw0 of tokens.length ? tokens : [family.trim()]) {
    const raw = raw0.trim();
    const noBin = raw.replace(/(\.bin|\.xbin)+$/i, "").replace(/_+$/, "");
    names.push(raw, noBin);
    const norm = normFamilyToken(noBin);
    if (norm) names.push(norm);
    // mzd_cx50_e+b → also try mazda_cx50
    const core = norm.replace(/_(eb|en|bd|e|b|i|r\d.*)$/g, "").replace(/_+$/, "");
    if (core && core.length >= 4) names.push(core);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = n.toLowerCase();
    if (!n || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

function softwareRoots(fd: boolean): string[] {
  // FD: Pro-FD only (never Ghost-III folder). Non-FD: Ghost-II/Pro family folders.
  return fd ? [path.join(SOFTWARE_FD, "Pro-FD")] : [SOFTWARE_II_PRO];
}

const PRO_FD_DIR = path.join(SOFTWARE_FD, "Pro-FD");

/** Pro-FD .xbin files keyed by family suffix (vag, bmw, mercedes, …). Skip *_old*. */
function listProFdByFamily(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!fs.existsSync(PRO_FD_DIR)) return map;
  for (const f of fs.readdirSync(PRO_FD_DIR)) {
    if (!/\.xbin$/i.test(f)) continue;
    if (/_old/i.test(f)) continue;
    const base = f.replace(/\.xbin$/i, "");
    const m = base.match(/ghost-pro-fd_v[\d.]+[a-z]?_?\d+(?:_\d+)?_(.+)$/i);
    const fam = (m?.[1] ?? base.split("_").pop() ?? "").toLowerCase();
    if (!fam) continue;
    if (!map.has(fam)) map.set(fam, []);
    map.get(fam)!.push(path.join(PRO_FD_DIR, f));
  }
  return map;
}

/**
 * Resolve Pro-FD .xbin path(s) from PDF FAMILY FILE / ghost type.
 * e.g. family "vag" → ghost-pro-fd_…_vag.xbin
 */
function findProFdSoftware(family: string | null): string[] {
  if (!family) return [];
  const byFam = listProFdByFamily();
  const out: string[] = [];
  for (const cand of familyLookupNames(family)) {
    const key = cand.toLowerCase().replace(/(\.bin|\.xbin)+$/i, "");
    const hits = byFam.get(key);
    if (hits?.length) out.push(...hits);
  }
  return [...new Set(out)];
}

function findFamilyDir(family: string, fd: boolean): string | null {
  const dirs = findAllFamilyDirs(family, fd);
  return dirs[0] ?? null;
}

function folderHasRootBins(dir: string): boolean {
  return rootSoftwareFiles(dir).length > 0;
}

/** True if old-files (or root) contain a bin whose name includes the PDF family token. */
function folderMatchesViaOldBins(dir: string, candidates: string[]): boolean {
  // Use specific family tokens only (drop cores like mazda_cx50 when mazda_cx50_eb exists)
  const all = candidates.map(normFamilyToken).filter((t) => t.length >= 4);
  const tokens = all.filter((t) => !all.some((o) => o !== t && o.startsWith(t)));
  if (!tokens.length) return false;
  const scanDirs = [dir];
  for (const sub of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    if (/old/i.test(sub.name)) scanDirs.push(path.join(dir, sub.name));
  }
  for (const d of scanDirs) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(d).filter((f) => /\.(bin|xbin|hex)$/i.test(f) && !/_old/i.test(f));
    } catch {
      continue;
    }
    for (const f of files) {
      const nf = normFamilyToken(f.replace(/\.(bin|xbin|hex)$/i, ""));
      for (const t of tokens) {
        if (nf.includes(t) || t.includes(nf)) return true;
        // mzd_cx50_e+b inside mazda_cx50_1r0e1p1 old bin names
        const tCore = t.replace(/_/g, "");
        const fCore = nf.replace(/_/g, "");
        if (tCore.length >= 6 && fCore.includes(tCore)) return true;
      }
    }
  }
  return false;
}

function scoreFolderMatch(folderName: string, candidates: string[]): number {
  const fn = normFamilyToken(folderName);
  let best = 0;
  for (const c of candidates) {
    const cn = normFamilyToken(c);
    if (!cn) continue;
    if (fn === cn) best = Math.max(best, 100);
    else if (fn.startsWith(cn) || cn.startsWith(fn)) best = Math.max(best, 80);
    else if (fn.includes(cn) || cn.includes(fn)) best = Math.max(best, 60);
    else {
      // shared significant token e.g. cx50
      const parts = cn.split("_").filter((p) => p.length >= 3);
      const hits = parts.filter((p) => fn.includes(p)).length;
      if (hits >= 2) best = Math.max(best, 50 + hits * 5);
      else if (hits === 1 && parts.some((p) => p.length >= 4 && fn.includes(p)))
        best = Math.max(best, 40);
    }
  }
  return best;
}

/**
 * All matching Ghost-II/Pro family folders.
 * Also discovers renamed folders by scanning "old files" bins that still use the PDF family name
 * (e.g. mzd_cx50_e+b.bin inside mazda_cx50_1r0e1p1/old files → use main-folder bins).
 */
function findAllFamilyDirs(family: string, fd: boolean): string[] {
  if (fd) return []; // FD uses Pro-FD .xbin flat files, not family folders
  const roots = softwareRoots(false);
  const candidates = familyLookupNames(family);
  const scored: Array<{ dir: string; score: number; hasRoot: boolean; viaOld: boolean }> = [];
  const seen = new Set<string>();

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());

    // 1) Exact / lookup-name hits
    for (const name of candidates) {
      const want = name.toLowerCase();
      const hit = dirs.find((d) => d.name.toLowerCase() === want);
      if (!hit) continue;
      const full = path.join(root, hit.name);
      if (seen.has(full.toLowerCase())) continue;
      seen.add(full.toLowerCase());
      scored.push({
        dir: full,
        score: 100,
        hasRoot: folderHasRootBins(full),
        viaOld: folderMatchesViaOldBins(full, candidates),
      });
    }

    // 2) Fuzzy name + old-files bin discovery
    for (const d of dirs) {
      const full = path.join(root, d.name);
      const key = full.toLowerCase();
      if (seen.has(key)) continue;
      const nameScore = scoreFolderMatch(d.name, candidates);
      const viaOld = folderMatchesViaOldBins(full, candidates);
      if (nameScore < 40 && !viaOld) continue;
      seen.add(key);
      scored.push({
        dir: full,
        score: Math.max(nameScore, viaOld ? 85 : 0),
        hasRoot: folderHasRootBins(full),
        viaOld,
      });
    }
  }

  // When old-files bins still use the PDF family name, prefer those folders only
  // (renamed pack folders e.g. mzd_cx50_e+b → mazda_cx50_1r0e1p1).
  const pool = scored.some((s) => s.viaOld)
    ? scored.filter((s) => s.viaOld || s.score >= 100)
    : scored;

  // Prefer folders that have root-level (current) bins; highest score first
  pool.sort((a, b) => {
    if (a.hasRoot !== b.hasRoot) return a.hasRoot ? -1 : 1;
    return b.score - a.score;
  });

  // Keep top matches only (avoid attaching every mazda_* folder)
  const top = pool.filter((s) => s.score >= 60 || (s.hasRoot && s.score >= 50));
  if (!top.length) return pool.slice(0, 1).map((s) => s.dir);
  const best = top[0].score;
  return top.filter((s) => s.score >= best - 20).slice(0, 3).map((s) => s.dir);
}

/** Current firmware only — root of family folder. Never old/prospective/test subfolders. */
function rootSoftwareFiles(familyDir: string): string[] {
  return fs
    .readdirSync(familyDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(familyDir, d.name))
    .filter((p) => /\.(bin|zip|hex|xbin)$/i.test(p))
    .filter((p) => !/_old/i.test(path.basename(p)));
}

function normalizeWireName(raw: string): string {
  const t = raw.trim().toUpperCase();
  // Ignition before generic 12V (e.g. "12V+IGN", "12V+ Ignition (IGRD)")
  if (t.includes("IGN") || t.includes("IGNITION")) return "Ignition";
  if (t === "+12V" || t === "12V" || t === "12V+" || /^12V\+?$/.test(t)) return "12V Constant";
  if (t === "GROUND" || t === "GND" || t === "0V" || t === "0V-") return "Ground";
  if (t === "CAN-H" || t === "CAN H" || t === "CANH") return "CAN-H";
  if (t === "CAN-L" || t === "CAN L" || t === "CANL") return "CAN-L";
  if (t.includes("RELAY")) return "Relay control";
  if (t.includes("INDICATION")) return "Indication";
  if (t === "LIN") return "LIN";
  return titleCase(raw.trim());
}

/** Decode 24-bit uncompressed BMP (Autowatch often saves these as .jpg). */
function bmp24ToRgb(buf: Buffer): { width: number; height: number; data: Buffer } | null {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null;
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  let height = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const comp = buf.readUInt32LE(30);
  if (bpp !== 24 || comp !== 0 || width <= 0) return null;
  const bottomUp = height > 0;
  height = Math.abs(height);
  if (height <= 0 || offset >= buf.length) return null;
  const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const srcY = bottomUp ? height - 1 - y : y;
    const srcRow = offset + srcY * rowSize;
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * 3;
      const di = (y * width + x) * 3;
      if (si + 2 >= buf.length) return null;
      data[di] = buf[si + 2];
      data[di + 1] = buf[si + 1];
      data[di + 2] = buf[si];
    }
  }
  return { width, height, data };
}

function sliceBetween(flat: string, startRe: RegExp, endRe: RegExp): string {
  const sm = startRe.exec(flat);
  if (!sm) return "";
  const from = sm.index + sm[0].length;
  const rest = flat.slice(from);
  const em = endRe.exec(rest);
  return (em ? rest.slice(0, em.index) : rest).trim();
}

function stripVehicleFooter(s: string): string {
  // Autowatch footers: "Toyota Highlander (U70) Engine Stall · Installation Notes Generated on…"
  // Do not allow "/" in the brand tokens so "N/C" is never swallowed.
  let out = s
    .replace(
      /(?:^|\s+)[A-Z][a-z]+(?:\s+[A-Za-z0-9\-[\]()]+){1,10}\s*·\s*(Installation Notes|Button List|Installation Details|Overview|Vehicle Photos)\b.*$/i,
      ""
    )
    .replace(/\s*Generated on\b.*$/i, "")
    .replace(/\s*T E C H N I C I A N.*$/i, "")
    .replace(/\s+by Canada User\b.*$/i, "")
    .replace(/\s+causer@\S+.*$/i, "")
    .trim();
  // Drop leftover brand-only crumbs (e.g. "Toyota" after a partial footer strip)
  if (/^[A-Z][a-z]+$/.test(out)) return "";
  return out;
}

function splitNoteItems(chunk: string): string[] {
  if (!chunk) return [];
  // Split on real bullets "•" only — do NOT split on middle-dot "·"
  // (Autowatch uses "·" in page footers like "Toyota … · Installation Notes").
  const cleaned = stripVehicleFooter(chunk);
  return cleaned
    .split(/\s*•\s*|\s*\d+\)\s*/)
    .map((s) => iglaize(stripVehicleFooter(s.replace(/^[-*•]\s*/, "").trim())))
    .filter((s) => s.length > 4)
    .filter((s) => !/^(Notes|Installation Notes|SECTION\s+\d+|Button List)/i.test(s))
    .map((s) => s.replace(/\s+/g, " ").trim());
}

/** Split long run-on sentences into readable lines when PDFs lack bullets. */
function splitSentences(chunk: string): string[] {
  const cleaned = stripVehicleFooter(chunk.replace(/\s+/g, " ").trim());
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z])|\s+(?=Option\s+\d+)/i)
    .map((s) => iglaize(s.trim()))
    .filter((s) => s.length > 8);
  return parts.length ? parts : [iglaize(cleaned)];
}

function looksLikeColor(s: string): boolean {
  return /^(Black|White|Green|Red|Yellow|Blue|Orange|Pink|Beige|Tan|Lavender|Violet|Grey|Gray|Brown|Purple|White\/Black|Black\/White|Lavender\/Green|Green\/[^:\s]+|[A-Za-z]+\/[A-Za-z]+)(\b|$)/i.test(
    s.trim()
  );
}

/** Canada / Technician Pack PDFs use Installation Details bullets, not [WIRE]: Ghost … */
function parseTechPackWires(flat: string): { connectionPoint: string | null; wires: WireRow[] } {
  const details = sliceBetween(
    flat,
    /Installation Details\s+SECTION\s+\d+\s+OF\s+\d+\s*/i,
    /Installation Notes\s+SECTION|Button List\s+SECTION|Vehicle Photos/i
  );
  if (!details || details.length < 20) return { connectionPoint: null, wires: [] };

  let connectionPoint: string | null = null;
  const powerAt = details.match(/Power at\s+([^•]+?)(?=\s*•)/i);
  if (powerAt) connectionPoint = iglaize(powerAt[1].replace(/\s+/g, " ").trim());
  else {
    const canAt = details.match(/Can bus at(?:\s+the)?\s+([^•]+?)(?=\s*•)/i);
    if (canAt) connectionPoint = iglaize(canAt[1].replace(/\s+/g, " ").trim());
  }
  if (!connectionPoint) {
    const pts = details.match(
      /Connection points?\s+(.+?)(?=\s+Connections on|\s+•\s*12V|\s+Canbus|\s+12V\+)/i
    );
    if (pts) connectionPoint = iglaize(pts[1].replace(/\s+/g, " ").trim());
  }

  const wires: WireRow[] = [];
  for (const raw of details.split(/\s*•\s*/)) {
    const b = raw.replace(/\s+/g, " ").trim();
    if (!b) continue;
    const wireStart = b.match(
      /^(12V\+\s*Ignition(?:\s*\([^)]+\))?|12V\+IGN|12V\s*IGN\s*\(\+\)|12V\+|0V-|Can\s*H|Can\s*L)\s*:\s*(.+)$/i
    );
    if (!wireStart) continue;
    const rawName = wireStart[1].trim();
    const parts = wireStart[2]
      .split(/\s*:\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    const colorIdx = parts.findIndex((p) => looksLikeColor(p));
    if (colorIdx < 0) continue;
    const color = parts[colorIdx].replace(/\.$/, "");
    const after = parts.slice(colorIdx + 1).join(": ");
    const pinM =
      after.match(/Connector\s+(\w+)\s+[Pp]in\s+(\d+)/i) ||
      after.match(/Connector\s+(\d+)\s+[Pp]in\s+(\d+)/i);
    const pin = pinM ? `Connector ${pinM[1]} pin ${pinM[2]}` : "";
    const fuse = after.match(/\(Fuse[^)]+\)/i)?.[0] ?? "";
    const extra = after
      .replace(/Connector\s+\w+\s+[Pp]in\s+\d+/i, "")
      .replace(/\(Fuse[^)]+\)/i, "")
      .replace(/^\s*[:\-–]\s*/, "")
      .trim();
    const note = stripVehicleFooter([extra, fuse].filter(Boolean).join(" — "));
    wires.push({
      name: normalizeWireName(rawName),
      location: connectionPoint ?? "",
      color,
      pin,
      note: note ? iglaize(note) : "",
    });
  }
  return { connectionPoint, wires };
}

function parseTechPackNotes(flat: string): {
  importantNotes: string[];
  requiredFeatures: string[];
  buttonLines: string[];
} {
  const notesChunk = sliceBetween(
    flat,
    /Installation Notes\s+SECTION\s+\d+\s+OF\s+\d+\s*/i,
    /Button List\s+SECTION|Vehicle Photos|Install Photos/i
  );
  const importantNotes: string[] = [];
  const requiredFeatures: string[] = [];
  if (notesChunk) {
    const cleaned = stripVehicleFooter(notesChunk.replace(/^Notes:\s*/i, "").trim());
    const optionSplit = cleaned.split(/(?=Option\s+\d+)/i);
    for (const part of optionSplit) {
      const t = part.trim();
      if (!t) continue;
      if (/^Option\s+\d+/i.test(t)) {
        // Keep Option header as its own line, then each setting bullet separately
        const headerEnd = t.search(/\s*[•·]\s*/);
        const header = stripVehicleFooter(
          (headerEnd >= 0 ? t.slice(0, headerEnd) : t).replace(/\s+/g, " ").trim()
        );
        if (header) requiredFeatures.push(iglaize(header));
        const body = headerEnd >= 0 ? t.slice(headerEnd) : "";
        const lines = splitNoteItems(body);
        requiredFeatures.push(...lines);
      } else {
        const bullets = splitNoteItems(t);
        importantNotes.push(...(bullets.length ? bullets : splitSentences(t)));
      }
    }
  }

  const buttonChunk = stripVehicleFooter(
    sliceBetween(
      flat,
      /Button List\s+SECTION\s+\d+\s+OF\s+\d+\s*/i,
      /Vehicle Photos|Install Photos|Button Photos|Generated on/i
    )
  );
  const buttonLines: string[] = [];
  if (buttonChunk) {
    const labelled: string[] = [];
    const labelRe =
      /(Service button|Steering wheel|RH Drivers Dash|Drivers Dash|Indication)\s*:\s*([^•]+)/gi;
    let lm: RegExpExecArray | null;
    while ((lm = labelRe.exec(buttonChunk))) {
      labelled.push(iglaize(`${lm[1]}: ${lm[2].trim().replace(/\s+/g, " ")}`));
    }
    if (labelled.length) {
      buttonLines.push(...labelled);
    } else {
      // Technician pack: "Button Options for the X file… Indication signs … Service/Valet button … Authentication buttons …"
      const sections = buttonChunk.split(/(?=Button Options for the\s+)/i).filter((s) => s.trim());
      for (const sec of sections.length ? sections : [buttonChunk]) {
        const fileM = sec.match(/Button Options for the\s+([^\s]+)\s+file/i);
        if (fileM) buttonLines.push(iglaize(`Firmware button map: ${fileM[1].replace(/\.bin$/i, "")}`));
        const ind = sec.match(/Indication signs?\s+(.+?)(?=\s+Service\/Valet button|\s+Authentication buttons|$)/i);
        if (ind) buttonLines.push(iglaize(`Indication: ${ind[1].replace(/\s+/g, " ").trim()}`));
        const svc = sec.match(/Service\/Valet button\s+(.+?)(?=\s+Authentication buttons|$)/i);
        if (svc) buttonLines.push(iglaize(`Service/Valet button: ${svc[1].replace(/\s+/g, " ").trim()}`));
        const auth = sec.match(/Authentication buttons\s+(.+?)$/i);
        if (auth) buttonLines.push(iglaize(`Authentication buttons: ${auth[1].replace(/\s+/g, " ").trim()}`));
      }
      if (!buttonLines.length) {
        buttonLines.push(...splitSentences(buttonChunk).slice(0, 16));
      }
    }
  }
  return { importantNotes, requiredFeatures, buttonLines };
}

async function loadPdfJs(): Promise<any> {
  return import(pathToFileURL(PDFJS_PATH).href);
}

async function extractPdfMeta(pdfPath: string): Promise<PdfMeta> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: { str: string }) => it.str).join(" ") + "\n";
  }
  const flat = text.replace(/\s+/g, " ");

  // May be "t_hlnd_4.bin.bin or t_hiland_xu75.bin (2 files…)" — keep full string; lookup splits later.
  const family =
    flat
      .match(
        /FAMILY\s*FILE\s+([A-Za-z0-9_+\-.]+(?:\s+or\s+[A-Za-z0-9_+\-.]+)?(?:\s*\([^)]*\))?)/i
      )?.[1]
      ?.trim() ?? null;
  const ghostType =
    flat
      .match(/GHOST\s*TYPE\s+([A-Za-z0-9 \-]+?)(?=\s+YEAR|\s+MODEL|\s+CONFIGURATION)/i)?.[1]
      ?.trim() ?? null;
  // FD / Ghost-III: vehicle-specific config code (same .xbin, different CONFIGURATION)
  let configuration = parseConfiguration(flat);
  // Ghost-II guides usually have no CONFIGURATION — drop even if a token slipped through.
  if (configuration && ghostType && !isFdGhostType(ghostType)) {
    configuration = null;
  }
  const yearRange =
    flat.match(/YEAR\s*RANGE\s+([0-9]{4}(?:\s*[-–]\s*[0-9]{4})?)/i)?.[1]?.trim() ?? null;

  const connectionPointRaw =
    flat.match(/Connection point:\s*(.+?)(?=\s+Wires:|\s+Rolls-Royce|\s+McLaren|\s+[A-Z][a-z]+ ·)/i)?.[1]
      ?.trim() ??
    flat.match(/Connection point:\s*([^.]{5,200})/i)?.[1]?.trim() ??
    null;
  let connectionPoint = connectionPointRaw ? iglaize(connectionPointRaw) : null;

  let wires: WireRow[] = [];
  const wireRe = /\[([^\]]+)\]:\s*Ghost\s+([^\-–]+)\s*[-–]\s*([^;\]]+)/gi;
  let wm: RegExpExecArray | null;
  while ((wm = wireRe.exec(flat))) {
    const rawName = wm[1].trim();
    const moduleColor = wm[2].trim();
    const vehicleColor = wm[3].trim().replace(/\s+/g, " ");
    if (/^(INDICATION|RELAY\s*CONTROL|RELAY|LIN)$/i.test(rawName)) continue;
    if (/^no\s*connection$/i.test(vehicleColor) || vehicleColor === "-" || !vehicleColor) continue;
    wires.push({
      name: normalizeWireName(rawName),
      location: connectionPoint ?? "",
      color: vehicleColor,
      pin: "",
      note: moduleColor ? `IGLA ${moduleColor}` : "",
    });
  }

  // Technician Pack / Canada PDFs (Highlander, Crown, …) — different layout
  if (!wires.length) {
    const tech = parseTechPackWires(flat);
    wires = tech.wires;
    if (!connectionPoint && tech.connectionPoint) connectionPoint = tech.connectionPoint;
  }

  const stripPdfFooter = (s: string) =>
    s
      .replace(/[A-Za-z0-9 \-\[\]()]+·\s*(Installation Notes|Button List|Installation Details|Overview).*$/i, "")
      .replace(/Generated on.*$/i, "")
      .trim();

  let importantNotes = splitNoteItems(
    sliceBetween(flat, /IMPORTANT NOTES:\s*/i, /CONNECTION NOTES:|REQUIRED FEATURE|Button List|OPTIONAL FEATURES:/i)
  );

  const connectionNotesRaw = stripPdfFooter(
    sliceBetween(
      flat,
      /CONNECTION NOTES:\s*/i,
      /REQUIRED FEATURE|OPTIONAL FEATURES:|Button List|SECTION \d/i
    )
  );
  let connectionNotes = connectionNotesRaw
    ? connectionNotesRaw
        .split(/\s+(?=Must\b)|(?<=[.!])\s+(?=[A-Z*])/)
        .map((s) => iglaize(stripPdfFooter(s)))
        .filter((s) => s.length > 3)
    : [];

  let requiredFeatures = splitNoteItems(
    stripPdfFooter(
      sliceBetween(flat, /REQUIRED FEATURE PROGRAMMING:\s*/i, /OPTIONAL FEATURES:|Button List|SECTION \d/i)
    )
  ).filter((s) => !/^none$/i.test(s));

  const optionalFeatures = splitNoteItems(
    stripPdfFooter(
      sliceBetween(flat, /OPTIONAL FEATURES:\s*/i, /Button List|Vehicle Photos|SECTION \d|Generated on/i)
    )
  );

  let buttonLines: string[] = [];
  const buttonChunk = sliceBetween(
    flat,
    /Button List\s+SECTION \d+ OF \d+\s*/i,
    /Vehicle Photos|Install Photos|Button Photos|Generated on/i
  );
  if (buttonChunk && /Service button\s*:|Steering wheel\s*:/i.test(buttonChunk)) {
    const fieldRe =
      /(Service button|Steering wheel|RH Drivers Dash|Drivers Dash|Indication)\s*:\s*/gi;
    const parts: Array<{ label: string; start: number }> = [];
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(buttonChunk))) {
      parts.push({ label: fm[1], start: fm.index + fm[0].length });
    }
    for (let i = 0; i < parts.length; i++) {
      const nextLabelAt =
        i + 1 < parts.length
          ? buttonChunk.toLowerCase().indexOf(parts[i + 1].label.toLowerCase() + ":", parts[i].start)
          : -1;
      const value = buttonChunk
        .slice(parts[i].start, nextLabelAt >= 0 ? nextLabelAt : buttonChunk.length)
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[A-Za-z0-9 \-]+·\s*Button List.*$/i, "")
        .replace(/Generated on.*$/i, "")
        .trim();
      if (value) buttonLines.push(iglaize(`${parts[i].label}: ${value}`));
    }
  }

  // Fill gaps from Technician Pack sections when luxury-format fields were empty
  if (!importantNotes.length || !requiredFeatures.length || !buttonLines.length) {
    const techNotes = parseTechPackNotes(flat);
    if (!importantNotes.length) importantNotes = techNotes.importantNotes;
    if (!requiredFeatures.length) requiredFeatures = techNotes.requiredFeatures;
    if (!buttonLines.length) buttonLines = techNotes.buttonLines;
  }

  const softwareHints: string[] = [];
  const alarmHint = flat.match(/Use the file containing the ['"]alarm['"] text[^!]*/i)?.[0];
  if (alarmHint) softwareHints.push(iglaize(alarmHint));

  let fuel: string | null = null;
  let ignitionType: string | null = null;
  const fuelField = flat.match(
    /\bFUEL(?:\s*TYPE)?\s*[:\-]?\s*(Petrol|Gasoline|Diesel|Hybrid|PHEV|Electric|EV|Gas)\b/i
  );
  if (fuelField) {
    const f = fuelField[1].toLowerCase();
    fuel =
      f === "gasoline" || f === "gas"
        ? "Petrol"
        : f === "ev"
          ? "Electric"
          : f === "phev"
            ? "Hybrid"
            : titleCase(fuelField[1]);
  } else if (/\(Petrol\s*&\s*Hybrid\)/i.test(flat)) fuel = "Petrol / Hybrid";
  else if (/\belectric\b|\bev\b|battery electric/i.test(flat)) fuel = "Electric";
  else if (/\bhybrid\b|\bphev\b/i.test(flat)) fuel = "Hybrid";
  else if (/\bdiesel\b/i.test(flat)) fuel = "Diesel";
  else if (/\bpetrol\b|\bgasoline\b/i.test(flat)) fuel = "Petrol";

  const ignField = flat.match(
    /\bIGNITION(?:\s*TYPE)?\s*[:\-]?\s*(Push\s*Start|Key|Keyless|PTS)\b/i
  );
  if (ignField) {
    const i = ignField[1].toLowerCase();
    ignitionType = i.includes("key") && !i.includes("keyless") ? "Key" : "Push Start";
  } else if (/start\/stop button|push to start|press the start\/stop|pts\b|engine stall/i.test(flat)) {
    ignitionType = "Push Start";
  } else if (/turn (the )?key|key ignition|insert (the )?key/i.test(flat)) {
    ignitionType = "Key";
  }

  return {
    familyFile: family,
    configuration,
    ghostType,
    yearRange,
    connectionPoint,
    wires,
    importantNotes,
    connectionNotes,
    requiredFeatures,
    optionalFeatures,
    softwareHints,
    buttonLines,
    fuel,
    ignitionType,
  };
}

async function uploadBuffer(
  buf: Buffer,
  mime: string,
  prefix: string,
  libraryName?: string,
  ext = "bin",
  dims?: { width?: number; height?: number }
): Promise<{ assetId: string; size: number; name: string } | null> {
  try {
    const s3Key = `${prefix}/${randomBytes(10).toString("hex")}.${ext}`;
    await ensureBucket();
    await s3.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: buf, ContentType: mime })
    );
    const asset = await prisma.imageAsset.create({
      data: {
        s3Key,
        mime,
        size: buf.byteLength,
        libraryName: libraryName ?? null,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      },
    });
    return { assetId: asset.id, size: buf.byteLength, name: libraryName ?? s3Key };
  } catch (e) {
    console.warn(`  ! upload failed:`, (e as Error).message);
    return null;
  }
}

async function uploadLocalFile(
  filePath: string,
  mime: string,
  prefix: string,
  libraryName?: string
): Promise<{ assetId: string; size: number; name: string } | null> {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).replace(".", "").slice(0, 8) || "bin";
    return uploadBuffer(buf, mime, prefix, libraryName ?? path.basename(filePath), ext);
  } catch (e) {
    console.warn(`  ! upload failed ${path.basename(filePath)}:`, (e as Error).message);
    return null;
  }
}

let ocrWorker: Tesseract.Worker | null = null;
async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker("eng", 1, { logger: () => undefined });
  }
  return ocrWorker;
}

async function terminateOcr(): Promise<void> {
  if (ocrWorker) {
    await ocrWorker.terminate().catch(() => undefined);
    ocrWorker = null;
  }
}

/** Autowatch often saves BMP vehicle shots as .jpg — convert everything to real JPEG. */
async function preparePhotoJpeg(
  filePath: string
): Promise<{ buf: Buffer; width: number; height: number } | null> {
  try {
    const raw = fs.readFileSync(filePath);
    let pipeline: sharp.Sharp;
    if (raw[0] === 0x42 && raw[1] === 0x4d) {
      const decoded = bmp24ToRgb(raw);
      if (!decoded) return null;
      pipeline = sharp(decoded.data, {
        raw: { width: decoded.width, height: decoded.height, channels: 3 },
      });
    } else {
      pipeline = sharp(raw).rotate();
    }
    const meta = await pipeline.clone().metadata();
    const buf = await pipeline.jpeg({ quality: 88 }).toBuffer();
    return {
      buf,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  } catch (e) {
    console.warn(`  ! image convert failed ${path.basename(filePath)}:`, (e as Error).message);
    return null;
  }
}

async function shouldSkipPhoto(
  filePath: string,
  role: "install" | "button" | "vehicle",
  jpegBuf?: Buffer | null
): Promise<string | null> {
  const name = path.basename(filePath).toLowerCase();
  if (/ghost|autowatch|aw-/.test(name)) return "filename_branding";
  if (/diagram|wiring|schematic|ghost.?ii|ghost.?pro/.test(name)) return "suspected_diagram";

  // OCR install photos — reject Ghost module wiring charts / branded schematics (Rule 2)
  if (role === "install" && jpegBuf) {
    try {
      const worker = await getOcrWorker();
      const {
        data: { text },
      } = await worker.recognize(jpegBuf);
      const t = text.toLowerCase().replace(/\s+/g, " ");
      if (
        /\bghost\b/.test(t) ||
        /autowatch/.test(t) ||
        /ghost\s*ii/.test(t) ||
        /ghost\s*pro/.test(t) ||
        (/module/.test(t) && /can high/.test(t) && /can low/.test(t) && /vehicle/.test(t))
      ) {
        return "ghost_diagram_ocr";
      }
    } catch {
      const st = fs.statSync(filePath);
      if (st.size < 45000) return "tiny_likely_diagram";
    }
  }
  return null;
}

type UploadedPhoto = {
  imageAssetId: string;
  caption?: string;
  bytes: number;
  width: number;
  height: number;
};

/**
 * Cover/header MUST be a vehicle photo when any exist (even small Autowatch BMPs).
 * Never use button photos as cover. Install only as last resort if vehicle folder empty.
 */
function pickCoverId(
  vehicle: UploadedPhoto[],
  install: UploadedPhoto[],
  _button: UploadedPhoto[]
): string | null {
  const area = (p: UploadedPhoto) => Math.max(1, p.width) * Math.max(1, p.height) || p.bytes;
  if (vehicle.length) {
    const ranked = [...vehicle].sort((a, b) => area(b) - area(a) || b.bytes - a.bytes);
    return ranked[0].imageAssetId;
  }
  // No vehicle folder shots — prefer largest clean install photo; never buttons.
  if (install.length) {
    const ranked = [...install].sort((a, b) => area(b) - area(a) || b.bytes - a.bytes);
    return ranked[0].imageAssetId;
  }
  return null;
}

function sortRelsByFileSize(vehicleRoot: string, rels: string[]): string[] {
  return [...rels].sort((a, b) => {
    const pa = path.isAbsolute(a) ? a : path.join(vehicleRoot, a);
    const pb = path.isAbsolute(b) ? b : path.join(vehicleRoot, b);
    const sa = fs.existsSync(pa) ? fs.statSync(pa).size : 0;
    const sb = fs.existsSync(pb) ? fs.statSync(pb).size : 0;
    return sb - sa;
  });
}

function discoverPhotoRels(
  vehicleRoot: string,
  role: "install" | "button" | "vehicle"
): string[] {
  const dir = path.join(vehicleRoot, "photos", role);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|bmp|webp)$/i.test(f))
    .map((f) => path.join("photos", role, f));
}

async function uploadPhotoGroup(
  vehicleRoot: string,
  rels: string[],
  role: "install" | "button" | "vehicle",
  skipped: Array<{ file: string; reason: string }>
): Promise<UploadedPhoto[]> {
  const list = sortRelsByFileSize(
    vehicleRoot,
    rels.length ? rels : discoverPhotoRels(vehicleRoot, role)
  );
  const items: UploadedPhoto[] = [];
  for (const rel of list) {
    const abs = path.isAbsolute(rel) ? rel : path.join(vehicleRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const prepared = await preparePhotoJpeg(abs);
    if (!prepared) {
      skipped.push({ file: rel, reason: "convert_failed" });
      continue;
    }
    const reason = await shouldSkipPhoto(abs, role, prepared.buf);
    if (reason) {
      skipped.push({ file: rel, reason });
      continue;
    }
    const up = await uploadBuffer(
      prepared.buf,
      "image/jpeg",
      "ghost-import/images",
      undefined,
      "jpg",
      { width: prepared.width, height: prepared.height }
    );
    if (up) {
      items.push({
        imageAssetId: up.assetId,
        bytes: up.size,
        width: prepared.width,
        height: prepared.height,
      });
    }
  }
  return items;
}

async function findOrCreateMake(name: string) {
  return (
    (await prisma.make.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    })) ?? (await prisma.make.create({ data: { name } }))
  );
}

async function findOrCreateModelGen(
  makeId: string,
  modelName: string,
  yearFrom: number,
  yearTo: number | null
) {
  const model =
    (await prisma.model.findFirst({
      where: { makeId, name: { equals: modelName, mode: "insensitive" } },
    })) ?? (await prisma.model.create({ data: { makeId, name: modelName } }));

  const genName = yearTo ? `${yearFrom}–${yearTo}` : `${yearFrom}`;
  const generation =
    (await prisma.generation.findFirst({
      where: {
        modelId: model.id,
        yearStart: yearFrom,
        yearEnd: yearTo,
        name: { equals: genName, mode: "insensitive" },
      },
    })) ??
    (await prisma.generation.create({
      data: {
        modelId: model.id,
        name: genName,
        yearStart: yearFrom,
        yearEnd: yearTo,
      },
    }));

  return { model, generation };
}

async function resolveProducts(names: string[]) {
  const all = await prisma.iglaProduct.findMany();
  const out = [];
  for (const name of names) {
    const hit =
      all.find((p) => p.name.toLowerCase() === name.toLowerCase()) ??
      all.find((p) =>
        p.name.toLowerCase().includes(name.toLowerCase().replace(/^igla\s+/i, ""))
      );
    if (!hit) throw new Error(`Product not found in DB: ${name}`);
    out.push(hit);
  }
  return out;
}

async function deleteDraftGuild(id: string) {
  // Sections/blocks cascade via Prisma relations if configured; otherwise delete manually.
  await prisma.block.deleteMany({ where: { section: { guildId: id } } });
  await prisma.section.deleteMany({ where: { guildId: id } });
  await prisma.guildProduct.deleteMany({ where: { guildId: id } });
  await prisma.guildVersion.deleteMany({ where: { guildId: id } }).catch(() => undefined);
  await prisma.guild.delete({ where: { id } });
}

/** Re-try guides that failed with family_folder_missing (e.g. after .bin strip fix). */
function guidesFromMissingSoftwareLog(all: ManifestGuide[]): ManifestGuide[] {
  if (!fs.existsSync(LOG_PATH)) throw new Error(`No import log at ${LOG_PATH}`);
  const log = JSON.parse(fs.readFileSync(LOG_PATH, "utf8")) as ImportLogEntry[];
  // Use the last full-run window if present; otherwise all family_folder_missing rows
  const missKeys = new Set<string>();
  for (const e of log) {
    if (e.skipped?.startsWith("family_folder_missing")) {
      missKeys.add(`${e.brand}||${e.model}`);
    }
  }
  return all.filter((g) => missKeys.has(`${g.brand}||${g.model}`) && !canadaSkipReason(g.brand, g.model));
}

function pickGuides(all: ManifestGuide[], argv: string[]): ManifestGuide[] {
  const allowed = all.filter((g) => !canadaSkipReason(g.brand, g.model));
  const modelFlag = argv.indexOf("--model");
  if (modelFlag >= 0 && argv[modelFlag + 1]) {
    const m = argv[modelFlag + 1].toLowerCase();
    return allowed.filter((g) => g.model.toLowerCase().includes(m));
  }
  if (argv.includes("--test-luxury")) {
    return allowed.filter(
      (g) =>
        (/^mclaren$/i.test(g.brand) || /^rolls/i.test(g.brand)) && !/cullinan/i.test(g.model)
    );
  }
  if (argv.includes("--retry-missing")) {
    return guidesFromMissingSoftwareLog(all);
  }
  if (argv.includes("--repair-v2")) {
    // Re-import only vehicles that already have an Author-IGLA V2 draft (content fix pass)
    return allowed; // filtered further in main after DB lookup
  }
  if (argv.includes("--all")) {
    return allowed;
  }
  const brandFlag = argv.indexOf("--brand");
  if (brandFlag >= 0 && argv[brandFlag + 1]) {
    const b = argv[brandFlag + 1];
    if (canadaSkipReason(b, "")) {
      throw new Error(`Brand "${b}" is Canada-excluded (Rule 5) — no guides will be created.`);
    }
    return allowed.filter((g) => g.brand.toLowerCase() === b.toLowerCase());
  }
  throw new Error(
    "Pass --all, --retry-missing, --model Spectre, --test-luxury, or --brand <Name>"
  );
}

function settingsBlocks(meta: PdfMeta): Array<{ type: string; content: Record<string, unknown> }> {
  const blocks: Array<{ type: string; content: Record<string, unknown> }> = [];
  // Separate text blocks (not one giant callout) so notes stay readable in the editor/viewer.
  const pushSection = (title: string, items: string[], style: "info" | "warning" = "info") => {
    if (!items.length) return;
    blocks.push({ type: "callout", content: { text: title, style } });
    for (const item of items) {
      const t = item.trim();
      if (!t) continue;
      if (/^Option\s+\d+/i.test(t)) {
        blocks.push({ type: "text", content: { text: t } });
      } else {
        blocks.push({ type: "text", content: { text: `• ${t}` } });
      }
    }
  };
  if (meta.configuration) {
    blocks.push({
      type: "callout",
      content: {
        text: `CONFIGURATION (required for this vehicle)\n${meta.configuration}`,
        style: "warning",
      },
    });
  }
  pushSection("Important notes", meta.importantNotes);
  pushSection("Connection notes", meta.connectionNotes);
  pushSection("Required feature programming", meta.requiredFeatures);
  pushSection("Optional features", meta.optionalFeatures);
  for (const h of meta.softwareHints) {
    blocks.push({ type: "callout", content: { text: h, style: "warning" } });
  }
  if (!blocks.length) {
    blocks.push({
      type: "text",
      content: { text: "No settings notes found in source PDF — fill during review." },
    });
  }
  return blocks;
}

async function importOne(
  guide: ManifestGuide,
  adminId: string,
  replace: boolean
): Promise<ImportLogEntry> {
  const makeName = normalizeMake(guide.brand);
  const modelName = modelBaseName(guide.model);
  const pdfRel = guide.filePath ?? path.join(guide.brand, `${guide.model}.pdf`);
  const pdfPath = path.join(DOWNLOADS, pdfRel);
  const entry: ImportLogEntry = {
    at: new Date().toISOString(),
    brand: makeName,
    model: guide.model,
    familyFile: null,
  };

  const canadaSkip = canadaSkipReason(guide.brand, guide.model);
  if (canadaSkip) {
    entry.skipped = canadaSkip;
    console.log(`\n→ skip ${guide.brand} / ${guide.model} (${canadaSkip})`);
    return entry;
  }

  if (!fs.existsSync(pdfPath)) {
    entry.skipped = `missing_pdf: ${pdfPath}`;
    return entry;
  }

  console.log(`\n→ ${makeName} / ${guide.model}`);
  const meta = await extractPdfMeta(pdfPath);
  const ghostType = meta.ghostType || guide.ghostType || null;
  entry.familyFile = meta.familyFile;
  console.log(`  family=${meta.familyFile ?? "?"} type=${ghostType ?? "?"}`);

  if (!meta.familyFile) {
    entry.skipped = "no_family_file_in_pdf";
    return entry;
  }

  const years = parseYears(guide.model, guide.year, meta.yearRange);
  const products = await resolveProducts(productNamesFor(ghostType));
  // Header + Label always include V2. Never reuse/override existing site guide titles.
  const title = `${makeName} ${modelName} ${years.label} V2`;

  const make = await findOrCreateMake(makeName);

  const { model, generation } = await findOrCreateModelGen(
    make.id,
    modelName,
    years.yearFrom,
    years.yearTo
  );

  // Only our Author-IGLA V2 DRAFTs for THIS generation. Never touch published / site guides.
  // Scope by generationId so e.g. Ghost 2010–2020 and Ghost 2020 never delete each other.
  const prior = await prisma.guild.findMany({
    where: {
      makeId: make.id,
      modelId: model.id,
      generationId: generation.id,
      status: "DRAFT",
      AND: [
        {
          OR: [
            { title },
            { title: { endsWith: " V2" } },
            { title: { contains: "V2" } },
          ],
        },
        {
          OR: [
            { properties: { path: ["Source"], equals: "Author-IGLA" } },
            { title },
          ],
        },
      ],
    },
    select: { id: true, title: true, status: true },
  });

  if (prior.length && !replace) {
    entry.skipped = `already_exists_v2_draft: ${prior.map((p) => p.id).join(",")}`;
    entry.guildId = prior[0].id;
    console.log(`  - skip (V2 draft exists). Pass --replace to recreate this draft only.`);
    return entry;
  }
  for (const p of prior) {
    console.log(`  × deleting our V2 draft ${p.id} (${p.title})`);
    await deleteDraftGuild(p.id);
  }

  const fd = isFdGhostType(ghostType);
  // Still create the guide when firmware is missing — Ronen will add software later.
  const familyDirs = findAllFamilyDirs(meta.familyFile ?? "", fd);
  const proFdFiles = fd ? findProFdSoftware(meta.familyFile) : [];
  if (!familyDirs.length && !proFdFiles.length) {
    console.log(
      `  ! no software for ${meta.familyFile} — creating guide without firmware (pending)`
    );
    entry.softwarePending = meta.familyFile;
  } else if (familyDirs.length) {
    console.log(`  family folders: ${familyDirs.map((d) => path.basename(d)).join(", ")}`);
  }

  // Attach firmware. Ghost Pro still gets igla2_ (231) bins when present, but 231
  // is NOT marked as an available product. FD: Pro-FD .xbin only (never old / Ghost-III).
  // Ghost-II/Pro: root bins of family folder only (discover via old-files names, attach root).
  const softwareUploads: Array<{ assetId: string; name: string; size: number; kind: string }> = [];
  const seenSoft = new Set<string>();
  const binPaths = fd
    ? proFdFiles
    : familyDirs.flatMap((dir) => rootSoftwareFiles(dir));
  for (const binPath of binPaths) {
    const kind = classifyBin(path.basename(binPath));
    if (kind === "skip") continue;
    if (fd && kind !== "fd") continue;
    if (!fd && kind === "fd") continue;
    const renamed = renameSoftware(path.basename(binPath));
    if (!renamed || seenSoft.has(renamed)) continue;
    const up = await uploadLocalFile(
      binPath,
      "application/octet-stream",
      "ghost-import/software",
      renamed
    );
    if (up) {
      seenSoft.add(renamed);
      softwareUploads.push({ ...up, name: renamed, kind });
    }
  }
  console.log(
    `  software: ${softwareUploads.map((s) => s.name).join(", ") || "(none — pending)"}` +
      (meta.configuration ? ` | CONFIGURATION=${meta.configuration}` : "")
  );

  const vehicleRoot = path.join(
    DOWNLOADS,
    guide.vehicleFolder ?? path.join(guide.brand, guide.model)
  );
  const photoSkipped: Array<{ file: string; reason: string }> = [];
  // Cover preference: largest vehicle photos first (BMP→JPEG), then install, then button.
  const vehiclePhotos = await uploadPhotoGroup(
    vehicleRoot,
    guide.images?.vehicle ?? [],
    "vehicle",
    photoSkipped
  );
  const installPhotos = await uploadPhotoGroup(
    vehicleRoot,
    guide.images?.install ?? [],
    "install",
    photoSkipped
  );
  const buttonPhotos = await uploadPhotoGroup(
    vehicleRoot,
    guide.images?.button ?? [],
    "button",
    photoSkipped
  );
  const coverId = pickCoverId(vehiclePhotos, installPhotos, buttonPhotos);
  const skippedGhost = photoSkipped.filter((s) => /ghost|diagram/i.test(s.reason)).length;
  const coverMeta = [...vehiclePhotos, ...installPhotos, ...buttonPhotos].find(
    (p) => p.imageAssetId === coverId
  );
  console.log(
    `  photos: install=${installPhotos.length} button=${buttonPhotos.length} vehicle=${vehiclePhotos.length} cover=${coverId ? `${coverMeta?.width ?? "?"}x${coverMeta?.height ?? "?"}` : "no"} skipped=${photoSkipped.length}${skippedGhost ? ` (ghost/diagram ${skippedGhost})` : ""}`
  );

  const galleryItems = (photos: UploadedPhoto[]) =>
    photos.map(({ imageAssetId }) => ({ imageAssetId }));

  const region =
    (await prisma.region.findFirst()) ??
    (await prisma.region.create({ data: { name: "Canada" } }));

  // Never invent empty placeholder rows — only wires with a real vehicle connection.
  const wireRows = meta.wires;

  const softwareBlocks = softwareUploads.map((s) => ({
    type: "file_text" as const,
    content: {
      text:
        s.kind === "alarm" ? "IGLA Alarm version" : s.kind === "fd" ? "IGLA FD version" : "IGLA 231 version",
      assetId: s.assetId,
      name: s.name,
      size: s.size,
    },
  }));

  const buttonBlocks: Array<{ type: string; content: Record<string, unknown> }> = [
    ...meta.buttonLines.map((t) => ({ type: "text", content: { text: t } })),
    ...(buttonPhotos.length
      ? [{ type: "gallery", content: { items: galleryItems(buttonPhotos), columns: 3 } }]
      : []),
  ];
  if (!buttonBlocks.length) {
    buttonBlocks.push({
      type: "text",
      content: { text: "No button list found in source PDF — fill during review." },
    });
  }

  const locationBlocks: Array<{ type: string; content: Record<string, unknown> }> = [];
  if (meta.connectionPoint) {
    locationBlocks.push({ type: "text", content: { text: meta.connectionPoint } });
  }
  if (installPhotos.length) {
    locationBlocks.push({
      type: "gallery",
      content: { items: galleryItems(installPhotos), columns: 3 },
    });
  }

  const sections = [
    {
      order: 0,
      title: "Connection location(s)",
      type: "installation_point",
      blocks: locationBlocks,
    },
    {
      order: 1,
      title: "Connections",
      type: "connections",
      blocks: [{ type: "connections_table", content: { rows: wireRows } }],
    },
    {
      order: 2,
      title: "IGLA Settings",
      type: "settings",
      blocks: settingsBlocks(meta),
    },
    {
      order: 3,
      title: "Software",
      type: "software",
      blocks: softwareBlocks.length
        ? softwareBlocks
        : [
            {
              type: "text",
              content: {
                text: `Software pending — add firmware manually.\nFamily file from PDF: ${meta.familyFile ?? "(unknown)"}`,
              },
            },
          ],
    },
    {
      order: 4,
      title: "Buttons and Indication",
      type: "buttons_indications",
      blocks: buttonBlocks,
    },
  ];

  const properties: Record<string, string> = {
    Years: years.label,
    Label: "V2",
    Version: "V2",
    Status: "Based on Author Site",
    Source: "Author-IGLA",
    "Family file": meta.familyFile ?? "",
  };
  if (meta.configuration) properties.Configuration = meta.configuration;
  if (meta.fuel) properties.Fuel = meta.fuel;
  if (meta.ignitionType) properties["Ignition Type"] = meta.ignitionType;

  const guild = await prisma.guild.create({
    data: {
      regionId: region.id,
      makeId: make.id,
      modelId: model.id,
      generationId: generation.id,
      trimId: null,
      iglaProductId: products[0].id,
      title,
      status: "DRAFT",
      coverImageId: coverId,
      createdById: adminId,
      updatedById: adminId,
      properties: properties as Prisma.InputJsonValue,
      products: { create: products.map((p) => ({ iglaProductId: p.id })) },
      sections: {
        create: sections.map((s) => ({
          order: s.order,
          title: s.title,
          type: s.type,
          blocks: {
            create: s.blocks.map((b, j) => ({
              order: j,
              type: b.type,
              content: b.content as Prisma.InputJsonValue,
            })),
          },
        })),
      },
    },
  });

  entry.guildId = guild.id;
  entry.title = title;
  entry.products = products.map((p) => p.name);
  entry.software = softwareUploads.map((s) => s.name);
  entry.photosUploaded = installPhotos.length + buttonPhotos.length + vehiclePhotos.length;
  entry.photosSkipped = photoSkipped;
  console.log(`  ✓ DRAFT ${guild.id} — ${title}`);
  console.log(`    edit: http://localhost:3000/guides/${guild.id}/edit`);
  return entry;
}

async function main() {
  const repairV2 = process.argv.includes("--repair-v2");
  const replace =
    process.argv.includes("--replace") ||
    process.argv.includes("--force") ||
    repairV2; // repair always recreates our V2 drafts only
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as { guides: ManifestGuide[] };
  let guides = pickGuides(manifest.guides, process.argv);

  if (repairV2) {
    const existing = await prisma.guild.findMany({
      where: {
        status: "DRAFT",
        title: { endsWith: " V2" },
        properties: { path: ["Source"], equals: "Author-IGLA" },
      },
      select: { title: true, make: { select: { name: true } }, model: { select: { name: true } } },
    });
    const keys = new Set(
      existing.map((g) => `${g.make.name.toLowerCase()}||${g.model.name.toLowerCase()}`)
    );
    guides = guides.filter((g) =>
      keys.has(`${normalizeMake(g.brand).toLowerCase()}||${modelBaseName(g.model).toLowerCase()}`)
    );
    console.log(`Repair mode: ${guides.length} Author-IGLA V2 drafts to rebuild (of ${existing.length} in DB).`);
  }

  console.log(`Importing ${guides.length} guide(s) as DRAFT (V2)…`);
  console.log(`NEVER overrides published/site guides — only creates/replaces our V2 drafts.`);
  console.log(`Software root: ${SOFTWARE_ROOT}`);
  console.log(`Canada exclusions: ${CANADA_EXCLUSIONS_PATH}`);

  const admin = await prisma.userAccount.findFirstOrThrow({ where: { role: "ADMIN" } });
  const log: ImportLogEntry[] = fs.existsSync(LOG_PATH)
    ? JSON.parse(fs.readFileSync(LOG_PATH, "utf8"))
    : [];

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const started = Date.now();
  for (let i = 0; i < guides.length; i++) {
    const g = guides[i];
    const n = i + 1;
    try {
      process.stdout.write(`[${n}/${guides.length}] `);
      const entry = await importOne(g, admin.id, replace);
      log.push(entry);
      if (entry.error || entry.skipped) skipped++;
      else ok++;
    } catch (e) {
      failed++;
      log.push({
        at: new Date().toISOString(),
        brand: g.brand,
        model: g.model,
        familyFile: null,
        error: (e as Error).message,
      });
      console.error(`  ✗ ${g.brand} ${g.model}:`, (e as Error).message);
    }
    if (n % 10 === 0 || n === guides.length) {
      fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`  … progress ok=${ok} skipped=${skipped} failed=${failed} (${mins}m)`);
    }
  }

  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log(`\nDone. created=${ok} skipped=${skipped} failed=${failed}`);
  console.log(`Log: ${LOG_PATH}`);
  await terminateOcr();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
