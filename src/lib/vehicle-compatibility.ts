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
  /** "analog" | "digital" | null — type of block column on dealer/staff lists */
  blockKind?: string | null;
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
  /**
   * Guides bridged to the requested make via "Also matches make(s)". Their rows
   * carry the PRIMARY make, so a lookup under the secondary name would miss
   * them — see loadGuideIdsForAltMake.
   */
  makeAltGuideIds?: string[];
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
  const blockKindRaw = String(formData.get("blockKind") ?? "")
    .trim()
    .toLowerCase();
  const blockKind =
    blockKindRaw === "analog" || blockKindRaw === "digital"
      ? blockKindRaw
      : null;
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
    blockKind: analogBlockRequired ? "analog" : blockKind,
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
  // analogBlockType is optional — guide checkbox / quick list can mark Required
  // without a free-text type; dealers then see "Required".
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
      blockKind: input.analogBlockRequired
        ? "analog"
        : input.blockKind === "digital"
          ? "digital"
          : input.blockKind === "analog"
            ? "analog"
            : null,
      additionalBlockDetails: input.additionalBlockRequired
        ? input.additionalBlockDetails
        : null,
    },
  };
}

export const BLOCK_KIND_OPTIONS = [
  { value: "", label: "—" },
  { value: "analog", label: "Analog" },
  { value: "digital", label: "Digital" },
] as const;

export function formatBlockKind(kind: string | null | undefined): string {
  if (kind === "analog") return "Analog";
  if (kind === "digital") return "Digital";
  return "—";
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
    const byMake: Prisma.VehicleCompatibilityWhereInput = search.makeExact
      ? { make: { equals: search.make, mode: "insensitive" } }
      : { make: { contains: search.make, mode: "insensitive" } };
    // A bridged guide's row still says "Dodge"; it is only findable as "Ram"
    // through the guides that declare that bridge.
    const bridged = search.makeAltGuideIds ?? [];
    and.push(
      bridged.length
        ? { OR: [byMake, { sourceGuideId: { in: bridged } }] }
        : byMake,
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
  /**
   * Phase 3 — read live, never stored, so these can't drift.
   *
   * The row only copies the MODEL, which is why two guides for the same model
   * ("RAM 1500" and "RAM 1500 Classic") looked identical on the list: what tells
   * them apart is the guide's own title and its generation label, neither of
   * which lived on the row. Both are read from the guide at query time, along
   * with the extra model names it answers to.
   */
  title: string;
  generationName: string;
  altModelNames: string[];
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
    select: {
      id: true,
      status: true,
      hideFromCompatibility: true,
      title: true,
      generation: { select: { name: true } },
      altModelAliases: { select: { name: true } },
    },
  });
  for (const g of guides) {
    map.set(g.id, {
      status: g.status,
      hideFromCompatibility: g.hideFromCompatibility,
      title: g.title.trim(),
      generationName: g.generation.name.trim(),
      altModelNames: g.altModelAliases.map((a) => a.name.trim()).filter(Boolean),
    });
  }
  return map;
}

/**
 * What to show under the vehicle name so two guides for the same model can be
 * told apart — the guide's own title, or its generation label when the title
 * adds nothing (e.g. title "RAM 1500" on generation "FD CAN ONLY 2025").
 * Empty when neither says more than "make model" already does.
 */
export function guideVariantLabel(
  info: LiveGuideCompatInfo | undefined,
  make: string,
  model: string,
): string {
  if (!info) return "";
  const title = info.title;
  // Imported titles often just restate the vehicle and its years
  // ("Toyota C-HR 2016–2018 V2"). Compare with years and version suffixes
  // removed from BOTH sides, so only a title that genuinely names a variant
  // survives — the model name itself sometimes carries a year too.
  const core = (s: string) =>
    aliasKey(
      s
        .replace(/\b(19|20)\d{2}\b/g, " ")
        .replace(/\bv\d+\b/gi, " ")
        .replace(/[–—-]+/g, " "),
    );
  const titleCore = core(title);
  const titleAdds =
    titleCore && titleCore !== core(model) && titleCore !== core(`${make} ${model}`);
  if (titleAdds) return title;
  // Fall back to the generation label, but not when it's only a year range —
  // the Years column already says that, so it would just be noise.
  const gen = info.generationName;
  const genIsJustYears = !/[a-z]/i.test(gen);
  return gen && !genIsJustYears && aliasKey(gen) !== aliasKey(model) ? gen : "";
}

/**
 * The extra model names each source guide is served under (GuildModelAlias), so a
 * compatibility lookup answers to the same names the guide resolver does — a
 * "Land Cruiser" row also being found as "Land Cruiser 250".
 * Keyed by guide id, holding the names as typed (they're shown in dropdowns).
 */
export async function loadGuideModelAliases(
  sourceGuideIds: Array<string | null | undefined>,
): Promise<Map<string, string[]>> {
  const ids = [...new Set(sourceGuideIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const rows = await prisma.guildModelAlias.findMany({
    where: { guildId: { in: ids } },
    select: { guildId: true, name: true },
  });
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    map.set(r.guildId, [...(map.get(r.guildId) ?? []), name]);
  }
  return map;
}

/**
 * The guides bridged to a secondary make name ("Also matches make(s)").
 *
 * The compatibility mirror only ever copies a guide's PRIMARY make, so a lookup
 * for "Ram 1500" finds nothing even though the guide resolver serves it — which
 * is how the portal ended up saying "no compatibility information" for a vehicle
 * whose guide it had just listed. Exact make-name match only: a bridge is an
 * explicit per-guide statement, never a fuzzy one.
 */
export async function loadGuideIdsForAltMake(makeName: string): Promise<string[]> {
  const want = makeName.trim();
  if (!want) return [];
  const guides = await prisma.guild.findMany({
    where: { altMakes: { some: { make: { name: { equals: want, mode: "insensitive" } } } } },
    select: { id: true },
  });
  return guides.map((g) => g.id);
}

/**
 * Secondary make names per guide, for building dropdown options — the mirror of
 * loadGuideIdsForAltMake, read in bulk for a page of rows.
 */
export async function loadGuideAltMakes(
  sourceGuideIds: Array<string | null | undefined>,
): Promise<Map<string, string[]>> {
  const ids = [...new Set(sourceGuideIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const guides = await prisma.guild.findMany({
    where: { id: { in: ids } },
    select: { id: true, altMakes: { select: { make: { select: { name: true } } } } },
  });
  for (const g of guides) {
    const names = g.altMakes.map((m) => m.make.name.trim()).filter(Boolean);
    if (names.length) map.set(g.id, names);
  }
  return map;
}

/** Normalise a model name for exact alias comparison (case/punctuation only). */
export function aliasKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Does this row answer to the requested model name — either by its own model
 * (base-name match) or because its source guide declares that exact extra name?
 */
export function rowMatchesModel(
  row: { model: string; sourceGuideId?: string | null },
  requestedModel: string,
  aliasesByGuide: Map<string, string[]>,
): boolean {
  if (modelMatchesBase(row.model, requestedModel)) return true;
  if (!row.sourceGuideId) return false;
  const want = aliasKey(requestedModel);
  if (!want) return false;
  return (aliasesByGuide.get(row.sourceGuideId) ?? []).some(
    (name) => aliasKey(name) === want,
  );
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
 * Push live guide identity (make/model/years/trim/products/status) onto every
 * VehicleCompatibility row linked via sourceGuideId.
 *
 * READ-ONLY on Guild — never creates, edits, publishes, or deletes guides.
 * Returns how many compatibility rows were updated (0 if none linked).
 */
export async function syncCompatibilityFromGuide(guildId: string): Promise<number> {
  const g = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      status: true,
      analogBlockingRequired: true,
      alarmMoreButtons: true,
      make: { select: { name: true } },
      model: { select: { name: true } },
      trim: { select: { name: true } },
      generation: { select: { yearStart: true, yearEnd: true } },
      iglaProduct: { select: { name: true } },
      products: { select: { iglaProduct: { select: { name: true } } } },
    },
  });
  if (!g) return 0;

  const productNames = [
    g.iglaProduct.name,
    ...g.products.map((p) => p.iglaProduct.name),
  ];
  const iglaProducts = expandIglaProducts(productNames);

  // Only the fields the guide owns. dealerNotes / internalAdminNotes /
  // isVisibleToDealers are human-authored and never touched here — on create
  // they simply take their column defaults.
  const owned = {
    make: g.make.name,
    model: g.model.name,
    yearFrom: g.generation.yearStart,
    yearTo: g.generation.yearEnd,
    trim: g.trim?.name ?? null,
    iglaProducts,
    alarmMoreButtons: g.alarmMoreButtons,
    sourceGuideStatus: g.status,
    // Guide checkbox drives Analog column; does not invent analogBlockType text.
    analogBlockRequired: g.analogBlockingRequired,
    ...(g.analogBlockingRequired ? { blockKind: "analog" } : {}),
  };

  // Upsert, not update: a guide with no row used to stay off the list forever,
  // which is how published guides went missing. Keyed on the unique
  // sourceGuideId so a guide can only ever own one row.
  const existing = await prisma.vehicleCompatibility.findUnique({
    where: { sourceGuideId: guildId },
    select: { id: true },
  });
  await prisma.vehicleCompatibility.upsert({
    where: { sourceGuideId: guildId },
    update: owned,
    create: { ...owned, sourceGuideId: guildId },
  });
  return existing ? 1 : 0;
}

/**
 * Same as syncCompatibilityFromGuide but reports which happened — used by the
 * reconcile script's summary. Returns null when the guide doesn't exist.
 */
export async function syncCompatibilityFromGuideDetailed(
  guildId: string,
): Promise<"created" | "updated" | null> {
  const before = await prisma.vehicleCompatibility.findUnique({
    where: { sourceGuideId: guildId },
    select: { id: true },
  });
  const exists = await prisma.guild.findUnique({ where: { id: guildId }, select: { id: true } });
  if (!exists) return null;
  await syncCompatibilityFromGuide(guildId);
  return before ? "updated" : "created";
}

async function syncCompatibilityForGuildIds(guildIds: string[]): Promise<number> {
  let n = 0;
  for (const id of [...new Set(guildIds)]) {
    n += await syncCompatibilityFromGuide(id);
  }
  return n;
}

/** Sync compat rows for every guide that uses this generation (shared year frame). */
export async function syncCompatibilityForGeneration(
  generationId: string,
): Promise<number> {
  const guilds = await prisma.guild.findMany({
    where: { generationId },
    select: { id: true },
  });
  return syncCompatibilityForGuildIds(guilds.map((g) => g.id));
}

/** Sync compat rows for every guide under this model. */
export async function syncCompatibilityForModel(modelId: string): Promise<number> {
  const guilds = await prisma.guild.findMany({
    where: { modelId },
    select: { id: true },
  });
  return syncCompatibilityForGuildIds(guilds.map((g) => g.id));
}

/** Sync compat rows for every guide under this make. */
export async function syncCompatibilityForMake(makeId: string): Promise<number> {
  const guilds = await prisma.guild.findMany({
    where: { makeId },
    select: { id: true },
  });
  return syncCompatibilityForGuildIds(guilds.map((g) => g.id));
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
    // Manual coverage with no guide behind it: kept in the table, but never
    // shown — nothing backs it and it can't be reviewed or resynced.
    if (!r.sourceGuideId) return false;
    const info = live.get(r.sourceGuideId);
    // Orphan: the guide is gone, so this row is stale by definition. Hide it
    // (Phase 2's reconcile deletes them for good).
    if (!info) return false;
    if (info.status === "ARCHIVED") return false;
    if (info.hideFromCompatibility) return false;
    return true;
  });
}

/**
 * One light scan for search dropdowns (makes / models / years).
 * Avoids separate full-table queries that were wedging localhost.
 */
export async function listCompatibilitySearchMeta(opts?: {
  visibleOnly?: boolean;
  /** Default true — hide models that only exist via archived/hidden guides. */
  excludeArchivedGuides?: boolean;
  /**
   * Public pages: only ship the model list for THIS make (the cascade needs no
   * more than that). Keeps one anonymous request from handing over the entire
   * make→model catalog. Makes are still listed so the first dropdown works.
   */
  onlyMake?: string;
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
  // The extra model names each row's guide is served under — offered as their own
  // options so a vehicle is findable by every name it answers to, not just the
  // one its guide happens to be filed under.
  const aliasesByGuide = await loadGuideModelAliases(rows.map((r) => r.sourceGuideId));
  // The secondary makes each row's guide is bridged to, so the same vehicle is
  // offered under both names ("1500" under Dodge AND under Ram).
  const altMakesByGuide = await loadGuideAltMakes(rows.map((r) => r.sourceGuideId));

  // make → compact key → preferred display label
  const byMake = new Map<string, Map<string, string>>();
  const addOption = (make: string, label: string, key: string) => {
    if (!label || !key) return;
    let map = byMake.get(make);
    if (!map) {
      map = new Map();
      byMake.set(make, map);
    }
    const existing = map.get(key);
    if (
      !existing ||
      label.length < existing.length ||
      (!label.includes("-") && existing.includes("-"))
    ) {
      map.set(key, label);
    }
  };
  for (const r of rows) {
    const guideId = r.sourceGuideId;
    const modelNames = [
      r.model,
      ...(guideId ? aliasesByGuide.get(guideId) ?? [] : []),
    ];
    const makeNames = [r.make, ...(guideId ? altMakesByGuide.get(guideId) ?? [] : [])];
    for (const makeName of makeNames) {
      for (const name of modelNames) {
        addOption(makeName, baseModelName(name), modelBaseKey(name));
      }
    }
  }
  const modelsByMake: Record<string, string[]> = {};
  for (const [make, map] of byMake) {
    modelsByMake[make] = [...map.values()].sort((a, b) => a.localeCompare(b));
  }
  const makes = Object.keys(modelsByMake).sort((a, b) => a.localeCompare(b));

  // Public cascade: hand back only the selected make's models.
  if (opts?.onlyMake !== undefined) {
    const want = opts.onlyMake.trim();
    const scoped: Record<string, string[]> = {};
    if (want && modelsByMake[want]) scoped[want] = modelsByMake[want];
    return { makes, modelsByMake: scoped, yearOptions: buildYearOptions(rows) };
  }

  return {
    makes,
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
  blockKind: string | null;
  dealerNotes: string | null;
  /** Live guide status when linked; otherwise stored snapshot. */
  guideStatus: string | null;
  guidePublished: boolean;
  /**
   * Set only when BOTH units fit this vehicle and the guide marks Alarm as the
   * better pick — the installer is choosing between them, so the advice is
   * actionable. Never set when only one unit applies.
   */
  recommendAlarm: boolean;
};

/** Does this row cover both IGLA 231 and IGLA Alarm (so a choice exists)? */
export function coversBothIglaUnits(products: string[]): boolean {
  const lower = products.map((p) => p.toLowerCase());
  return lower.some((p) => p.includes("231")) && lower.some((p) => p.includes("alarm"));
}

/** The one sentence shown wherever we recommend Alarm over 231. */
export const ALARM_MORE_BUTTONS_NOTE =
  "Recommended IGLA Alarm as it enables to use more buttons than IGLA 231";

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
    blockKind?: string | null;
    dealerNotes: string | null;
    alarmMoreButtons?: boolean;
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
    blockKind: r.blockKind ?? (r.analogBlockRequired ? "analog" : null),
    dealerNotes: r.dealerNotes,
    guideStatus,
    guidePublished: guideStatus === "PUBLISHED",
    recommendAlarm: Boolean(r.alarmMoreButtons) && coversBothIglaUnits(r.iglaProducts),
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
