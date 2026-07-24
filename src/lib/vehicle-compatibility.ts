import { prisma } from "./db";
import type { Prisma, VehicleCompatibility } from "@prisma/client";

/** Canonical IGLA unit labels used on compatibility records. */
export const IGLA_PRODUCT_OPTIONS = [
  "IGLA 231",
  "IGLA Alarm",
  "IGLA FD",
  "IGLA BASE 2CAN",
] as const;

export type CompatibilityInput = {
  make: string;
  model: string;
  yearFrom: number;
  /** null = ongoing / through current year */
  yearTo: number | null;
  trim?: string | null;
  engineType?: string | null;
  transmissionType?: string | null;
  analogBlockRequired: boolean;
  analogBlockType?: string | null;
  additionalBlockRequired: boolean;
  additionalBlockDetails?: string | null;
  installationNotes?: string | null;
  dealerNotes?: string | null;
  internalAdminNotes?: string | null;
  isVisibleToDealers: boolean;
  iglaProducts: string[];
  sourceGuideId?: string | null;
  sourceGuideStatus?: string | null;
};

/**
 * Normalize product names from a guide, then apply business rule:
 * IGLA 231 ⇒ also compatible with IGLA Alarm (not the reverse).
 */
export function expandIglaProducts(rawNames: string[]): string[] {
  const set = new Set<string>();
  for (const raw of rawNames) {
    const n = raw.trim();
    if (!n) continue;
    const lower = n.toLowerCase();
    if (lower.includes("231")) set.add("IGLA 231");
    else if (lower.includes("alarm")) set.add("IGLA Alarm");
    else if (/\bfd\b/.test(lower) || lower.includes("igla fd")) set.add("IGLA FD");
    else if (lower.includes("2can") || lower.includes("base")) set.add("IGLA BASE 2CAN");
    else if (lower.includes("compass")) continue;
    else set.add(n);
  }
  if (set.has("IGLA 231")) set.add("IGLA Alarm");
  const order = ["IGLA 231", "IGLA Alarm", "IGLA FD", "IGLA BASE 2CAN"];
  const ordered = order.filter((p) => set.has(p));
  for (const p of set) if (!ordered.includes(p)) ordered.push(p);
  return ordered;
}

export function formatIglaProducts(products: string[]): string {
  if (!products.length) return "—";
  return products.join(" · ");
}

export function currentCalendarYear(): number {
  return new Date().getFullYear();
}

/** Effective end year for display/math; null means ongoing through current+. */
export function effectiveYearTo(yearTo: number | null | undefined): number {
  return yearTo ?? currentCalendarYear();
}

export function yearsLabel(yearFrom: number, yearTo: number | null | undefined): string {
  if (yearTo == null) {
    return yearFrom === currentCalendarYear()
      ? `${yearFrom}–present`
      : `${yearFrom}–present`;
  }
  return yearFrom === yearTo ? String(yearFrom) : `${yearFrom}–${yearTo}`;
}

/**
 * Strip variation / generation / install-option noise for dealer dropdowns.
 * Examples:
 *   "RAV-4 [AX50] (Stall version…)" → "RAV4"
 *   "Highlander (U70) With Engine Stall" → "Highlander"
 * Dealers pick the simple model; result cards still show full detail + years.
 */
export function baseModelName(model: string): string {
  let s = model.trim();
  // Brackets / parentheses first (so dashes inside them don't truncate early)
  while (/\[[^\]]*\]/.test(s)) s = s.replace(/\[[^\]]*\]/g, " ");
  while (/\([^)]*\)/.test(s)) s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Drop trailing " - Standard / Petrol / …" notes. For Audi-style
  // "A3 - S3 - RS3" keep only the primary code (A3).
  const noteSeg =
    /^(standard|petrol|hybrid|diesel|relay|with\b|digital|dual\b|gearbox|engine\b|tested|facelift|start\s+inhibit|stall|body\s+can|cut\b)/i;
  const parts = s.split(/\s+[-–—]\s+/u).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const primary = parts[0] ?? "";
    const rest = parts.slice(1);
    const allShortCodes = parts.every((p) =>
      /^[A-Za-z]{1,3}\d{0,3}$/.test(p),
    );
    if (allShortCodes) {
      s = primary;
    } else {
      let kept = primary;
      for (const part of rest) {
        if (noteSeg.test(part) || /^\d{4}\b/.test(part)) break;
        // Don't append prose; stop at the first note-like segment
        if (!/^[A-Za-z0-9][A-Za-z0-9./]{0,12}$/.test(part)) break;
        // Sibling trim codes (Giulia Quadrifoglio etc.) stay in full model line
        break;
      }
      s = kept;
    }
  }

  s = s
    .replace(
      /\bwith\s+(engine\s+stall|remote\s+start|gearbox\s+lock)\b.*$/gi,
      "",
    )
    .replace(
      /\b(engine\s+stall|starter\s+interlock|slp\s+interlock|chassis\s+code(\s+\w+)?)\b.*$/gi,
      "",
    )
    .replace(/\s*[-–—]\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  // Trailing chassis codes with letters+digits (XV50, U70); keep Land Cruiser 200
  s = s.replace(/\s+[A-Za-z]{1,3}\d{2,4}[A-Za-z0-9]*$/g, "").trim();

  // Hyphenated token only: RAV-4 → RAV4, 4-Runner → 4Runner (not "Cruiser 200")
  s = s.replace(/\b([A-Za-z]{1,8})-(\d{1,4})\b/g, "$1$2");
  s = s.replace(/\b(\d{1,2})-([A-Za-z]+)\b/g, "$1$2");

  return s || model.trim();
}

/** Compact key so RAV4 / RAV-4 / "rav 4" group together. */
export function modelBaseKey(model: string): string {
  return baseModelName(model)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** True if a record's model belongs to the dealer-selected base model. */
export function modelMatchesBase(recordModel: string, selectedBase: string): boolean {
  const want = selectedBase.trim();
  if (!want) return true;
  return modelBaseKey(recordModel) === modelBaseKey(want);
}

/**
 * Year match for dealer search.
 * - Closed range: yearFrom…yearTo
 * - Open-ended (yearTo null): matches any year >= yearFrom, including current
 *   and near-future years dealers type (e.g. 2026, 2027).
 */
export function yearCoversRecord(
  yearFrom: number,
  yearTo: number | null | undefined,
  searchYear: number
): boolean {
  if (searchYear < yearFrom) return false;
  if (yearTo == null) return true; // ongoing → current & future years
  return searchYear <= yearTo;
}

/** Prisma filter fragment for a single search year (supports open-ended yearTo). */
export function yearMatchWhere(
  searchYear: number
): Prisma.VehicleCompatibilityWhereInput {
  return {
    yearFrom: { lte: searchYear },
    OR: [{ yearTo: null }, { yearTo: { gte: searchYear } }],
  };
}

export type CompatibilitySearch = {
  q?: string;
  make?: string;
  model?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  trim?: string;
  engineType?: string;
  transmissionType?: string;
  analogBlockRequired?: boolean;
  analogBlockType?: string;
  visibleOnly?: boolean;
  /** Exact make match (dropdown); uses equals not contains */
  makeExact?: boolean;
  modelExact?: boolean;
};

function clean(s: unknown): string | null {
  const v = String(s ?? "").trim();
  return v ? v : null;
}

export function parseCompatibilityForm(formData: FormData): CompatibilityInput {
  const yearFrom = Number(formData.get("yearFrom"));
  const yearToRaw = String(formData.get("yearTo") ?? "").trim();
  const yearTo = yearToRaw === "" ? null : Number(yearToRaw);
  const analogBlockRequired = formData.get("analogBlockRequired") === "yes";
  const additionalBlockRequired = formData.get("additionalBlockRequired") === "yes";
  const selected = formData.getAll("iglaProducts").map(String);
  return {
    make: String(formData.get("make") ?? "").trim(),
    model: String(formData.get("model") ?? "").trim(),
    yearFrom,
    yearTo: yearTo != null && Number.isNaN(yearTo) ? null : yearTo,
    trim: clean(formData.get("trim")),
    engineType: clean(formData.get("engineType")),
    transmissionType: clean(formData.get("transmissionType")),
    analogBlockRequired,
    analogBlockType: analogBlockRequired ? clean(formData.get("analogBlockType")) : null,
    additionalBlockRequired,
    additionalBlockDetails: additionalBlockRequired
      ? clean(formData.get("additionalBlockDetails"))
      : null,
    installationNotes: clean(formData.get("installationNotes")),
    dealerNotes: clean(formData.get("dealerNotes")),
    internalAdminNotes: clean(formData.get("internalAdminNotes")),
    isVisibleToDealers: formData.get("isVisibleToDealers") !== "no",
    iglaProducts: expandIglaProducts(selected),
    sourceGuideId: clean(formData.get("sourceGuideId")),
    sourceGuideStatus: clean(formData.get("sourceGuideStatus")),
  };
}

export function validateCompatibility(
  input: CompatibilityInput
): { ok: true; data: CompatibilityInput } | { ok: false; error: string } {
  if (!input.make || !input.model) {
    return { ok: false, error: "Make and model are required." };
  }
  if (!Number.isInteger(input.yearFrom) || input.yearFrom < 1980 || input.yearFrom > 2100) {
    return { ok: false, error: "Year From must be a valid year." };
  }
  if (input.yearTo != null) {
    if (!Number.isInteger(input.yearTo) || input.yearTo < 1980 || input.yearTo > 2100) {
      return { ok: false, error: "Year To must be a valid year, or blank for present." };
    }
    if (input.yearFrom > input.yearTo) {
      return { ok: false, error: "Year From cannot be greater than Year To." };
    }
  }
  if (input.analogBlockRequired && !input.analogBlockType) {
    return {
      ok: false,
      error: "Analog Blocking Type is required when Analog Blocking is Yes.",
    };
  }
  if (input.additionalBlockRequired && !input.additionalBlockDetails) {
    return {
      ok: false,
      error: "Additional Blocking Details are required when Additional Blocking is Yes.",
    };
  }
  return {
    ok: true,
    data: {
      ...input,
      make: input.make.trim(),
      model: input.model.trim(),
      iglaProducts: expandIglaProducts(input.iglaProducts ?? []),
      analogBlockType: input.analogBlockRequired ? input.analogBlockType : null,
      additionalBlockDetails: input.additionalBlockRequired
        ? input.additionalBlockDetails
        : null,
    },
  };
}

/** Overlapping year range + same make/model (and matching optional config fields). */
export async function findLikelyDuplicates(
  input: CompatibilityInput,
  excludeId?: string
): Promise<VehicleCompatibility[]> {
  const inputEnd = input.yearTo ?? 9999;
  const rows = await prisma.vehicleCompatibility.findMany({
    where: {
      make: { equals: input.make, mode: "insensitive" },
      model: { equals: input.model, mode: "insensitive" },
      yearFrom: { lte: inputEnd },
      OR: [{ yearTo: null }, { yearTo: { gte: input.yearFrom } }],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ make: "asc" }, { model: "asc" }, { yearFrom: "asc" }],
    take: 10,
  });

  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    const trimSame = norm(r.trim) === norm(input.trim);
    const engSame = norm(r.engineType) === norm(input.engineType);
    const transSame = norm(r.transmissionType) === norm(input.transmissionType);
    return trimSame && engSame && transSame;
  });
}

export function buildCompatibilityWhere(
  search: CompatibilitySearch
): Prisma.VehicleCompatibilityWhereInput {
  const and: Prisma.VehicleCompatibilityWhereInput[] = [];

  if (search.visibleOnly) and.push({ isVisibleToDealers: true });
  if (search.make) {
    and.push(
      search.makeExact
        ? { make: { equals: search.make, mode: "insensitive" } }
        : { make: { contains: search.make, mode: "insensitive" } }
    );
  }
  if (search.model) {
    and.push(
      search.modelExact
        ? { model: { equals: search.model, mode: "insensitive" } }
        : { model: { contains: search.model, mode: "insensitive" } }
    );
  }
  if (search.trim) {
    and.push({ trim: { contains: search.trim, mode: "insensitive" } });
  }
  if (search.engineType) {
    and.push({ engineType: { contains: search.engineType, mode: "insensitive" } });
  }
  if (search.transmissionType) {
    and.push({
      transmissionType: { contains: search.transmissionType, mode: "insensitive" },
    });
  }
  if (search.analogBlockRequired !== undefined) {
    and.push({ analogBlockRequired: search.analogBlockRequired });
  }
  if (search.analogBlockType) {
    and.push({
      analogBlockType: { contains: search.analogBlockType, mode: "insensitive" },
    });
  }
  if (typeof search.year === "number" && !Number.isNaN(search.year)) {
    and.push(yearMatchWhere(search.year));
  }
  if (typeof search.yearFrom === "number" && typeof search.yearTo === "number") {
    and.push({
      yearFrom: { lte: search.yearTo },
      OR: [{ yearTo: null }, { yearTo: { gte: search.yearFrom } }],
    });
  }

  const q = search.q?.trim();
  if (q) {
    const yearMatch = q.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : null;
    const tokens = q
      .replace(/\b(19|20)\d{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
    for (const token of tokens) {
      and.push({
        OR: [
          { make: { contains: token, mode: "insensitive" } },
          { model: { contains: token, mode: "insensitive" } },
          { trim: { contains: token, mode: "insensitive" } },
        ],
      });
    }
    if (year != null) and.push(yearMatchWhere(year));
  }

  return and.length ? { AND: and } : {};
}

export type LiveGuideCompatInfo = {
  status: string;
  hideFromCompatibility: boolean;
};

/** Live guild status + hide flag for optional sourceGuideId provenance links. */
export async function loadLiveGuideCompatInfo(
  sourceGuideIds: Array<string | null | undefined>,
): Promise<Map<string, LiveGuideCompatInfo>> {
  const ids = [...new Set(sourceGuideIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, LiveGuideCompatInfo>();
  if (!ids.length) return map;
  const guides = await prisma.guild.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, hideFromCompatibility: true },
  });
  for (const g of guides) {
    map.set(g.id, {
      status: g.status,
      hideFromCompatibility: g.hideFromCompatibility,
    });
  }
  return map;
}

/** Status-only map (notes / badges). Prefer loadLiveGuideCompatInfo for filtering. */
export async function loadLiveGuideStatuses(
  sourceGuideIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const live = await loadLiveGuideCompatInfo(sourceGuideIds);
  const map = new Map<string, string>();
  for (const [id, info] of live) map.set(id, info.status);
  return map;
}

/**
 * Drop compatibility rows whose linked source guide must not appear on
 * dealer / public / API lists:
 * - guide is ARCHIVED, or
 * - guide has hideFromCompatibility (overrides published)
 * Manual rows (no sourceGuideId) stay.
 */
export function excludeHiddenCompatibilityRows<
  T extends { sourceGuideId?: string | null },
>(rows: T[], live: Map<string, LiveGuideCompatInfo>): T[] {
  return rows.filter((r) => {
    if (!r.sourceGuideId) return true;
    const info = live.get(r.sourceGuideId);
    if (!info) return true;
    if (info.status === "ARCHIVED") return false;
    if (info.hideFromCompatibility) return false;
    return true;
  });
}

/** @deprecated Use excludeHiddenCompatibilityRows with loadLiveGuideCompatInfo. */
export function excludeArchivedGuideRows<
  T extends { sourceGuideId?: string | null },
>(rows: T[], liveStatus: Map<string, string>): T[] {
  const live = new Map<string, LiveGuideCompatInfo>();
  for (const [id, status] of liveStatus) {
    live.set(id, { status, hideFromCompatibility: false });
  }
  return excludeHiddenCompatibilityRows(rows, live);
}

/**
 * One light scan for search dropdowns (makes / models / years).
 * Avoids separate full-table queries that were wedging localhost.
 */
export async function listCompatibilitySearchMeta(opts?: {
  visibleOnly?: boolean;
  /** Default true — hide models that only exist via archived/hidden guides. */
  excludeArchivedGuides?: boolean;
}): Promise<{
  makes: string[];
  modelsByMake: Record<string, string[]>;
  yearOptions: number[];
}> {
  let rows = await prisma.vehicleCompatibility.findMany({
    where: opts?.visibleOnly === false ? {} : { isVisibleToDealers: true },
    select: {
      make: true,
      model: true,
      yearFrom: true,
      yearTo: true,
      sourceGuideId: true,
    },
    orderBy: [{ make: "asc" }, { model: "asc" }],
  });
  if (opts?.excludeArchivedGuides !== false) {
    const live = await loadLiveGuideCompatInfo(rows.map((r) => r.sourceGuideId));
    rows = excludeHiddenCompatibilityRows(rows, live);
  }
  // make → compact key → preferred display label
  const byMake = new Map<string, Map<string, string>>();
  for (const r of rows) {
    const base = baseModelName(r.model);
    if (!base) continue;
    const key = modelBaseKey(r.model);
    let map = byMake.get(r.make);
    if (!map) {
      map = new Map();
      byMake.set(r.make, map);
    }
    const existing = map.get(key);
    if (
      !existing ||
      base.length < existing.length ||
      (!base.includes("-") && existing.includes("-"))
    ) {
      map.set(key, base);
    }
  }
  const modelsByMake: Record<string, string[]> = {};
  for (const [make, map] of byMake) {
    modelsByMake[make] = [...map.values()].sort((a, b) => a.localeCompare(b));
  }
  return {
    makes: Object.keys(modelsByMake).sort((a, b) => a.localeCompare(b)),
    modelsByMake,
    yearOptions: buildYearOptions(rows),
  };
}

/**
 * Distinct makes + simplified (base) model names for dealer dropdowns.
 * Variations are collapsed so dealers pick "RAV4", then see every year/option.
 * By default skips rows linked to ARCHIVED / hide-from-compat guides.
 */
export async function listCompatibilityTaxonomy(opts?: {
  visibleOnly?: boolean;
  /** Default true — hide models that only exist via archived/hidden guides. */
  excludeArchivedGuides?: boolean;
}): Promise<{ makes: string[]; modelsByMake: Record<string, string[]> }> {
  const meta = await listCompatibilitySearchMeta(opts);
  return { makes: meta.makes, modelsByMake: meta.modelsByMake };
}

/**
 * Customer/dealer-safe API payload for one compatibility row.
 * Never includes internal admin notes or install-tech-only fields.
 */
export type PublicCompatibilityItem = {
  id: string;
  make: string;
  /** Simplified model for display/search (e.g. RAV4). */
  model: string;
  /** Full stored model string when it differs from `model`. */
  modelDetail: string | null;
  yearFrom: number;
  /** null = open-ended / through present */
  yearTo: number | null;
  yearsLabel: string;
  iglaProducts: string[];
  analogBlockRequired: boolean;
  analogBlockType: string | null;
  dealerNotes: string | null;
  /** Live guide status when linked; otherwise stored snapshot. */
  guideStatus: string | null;
  guidePublished: boolean;
};

export function toPublicCompatibilityItem(
  r: {
    id: string;
    make: string;
    model: string;
    yearFrom: number;
    yearTo: number | null;
    iglaProducts: string[];
    analogBlockRequired: boolean;
    analogBlockType: string | null;
    dealerNotes: string | null;
    sourceGuideStatus?: string | null;
  },
  liveGuideStatus?: string | null
): PublicCompatibilityItem {
  const base = baseModelName(r.model);
  const guideStatus = liveGuideStatus ?? r.sourceGuideStatus ?? null;
  return {
    id: r.id,
    make: r.make,
    model: base,
    modelDetail: base !== r.model.trim() ? r.model.trim() : null,
    yearFrom: r.yearFrom,
    yearTo: r.yearTo,
    yearsLabel: yearsLabel(r.yearFrom, r.yearTo),
    iglaProducts: r.iglaProducts,
    analogBlockRequired: r.analogBlockRequired,
    analogBlockType: r.analogBlockType,
    dealerNotes: r.dealerNotes,
    guideStatus,
    guidePublished: guideStatus === "PUBLISHED",
  };
}

/** Year options for dealer dropdown: known range ends + current and next year. */
export function buildYearOptions(
  rows: Array<{ yearFrom: number; yearTo: number | null }>
): number[] {
  const cy = currentCalendarYear();
  const set = new Set<number>([cy, cy + 1]);
  for (const r of rows) {
    for (let y = r.yearFrom; y <= effectiveYearTo(r.yearTo); y++) {
      if (y >= 1990 && y <= cy + 2) set.add(y);
    }
    // Always offer current/next so open-ended “present” vehicles are findable.
    if (r.yearTo == null) {
      set.add(cy);
      set.add(cy + 1);
    }
  }
  return [...set].sort((a, b) => b - a);
}
