import { prisma } from "@/lib/db";
import {
  buildCompatibilityWhere,
  excludeHiddenCompatibilityRows,
  loadLiveGuideCompatInfo,
  modelMatchesBase,
  type LiveGuideCompatInfo,
} from "@/lib/vehicle-compatibility";

/** Cap free-text / broad searches so one letter never dumps the whole table. */
export const COMPAT_RESULT_LIMIT = 200;

export type CompatListRow = {
  id: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number | null;
  trim: string | null;
  engineType: string | null;
  transmissionType: string | null;
  analogBlockRequired: boolean;
  analogBlockType: string | null;
  dealerNotes: string | null;
  iglaProducts: string[];
  isVisibleToDealers: boolean;
  sourceGuideId: string | null;
  sourceGuideStatus: string | null;
  guideStatus: string | null;
  updatedAt: string;
};

export type CompatListSearch = {
  make?: string;
  model?: string;
  year?: string;
  q?: string;
  view?: string;
  /** Staff opt-in: load every row (not on every page open). */
  all?: string;
};

/**
 * Load compatibility rows for staff/dealer pages.
 * Default: requires make and/or free-text `q` (capped).
 * Staff can pass showAll to load everything, sorted by last update.
 */
export async function loadCompatibilityList(opts: {
  make?: string;
  model?: string;
  year?: string;
  q?: string;
  /** Dealer / public: only dealer-visible + not guide-hidden. */
  dealerFacing: boolean;
  /**
   * Staff-only opt-in full list. Does not run on every page open —
   * only when the user clicks “Show all vehicles”.
   */
  showAll?: boolean;
}): Promise<{
  rows: CompatListRow[];
  liveCompat: Map<string, LiveGuideCompatInfo>;
  truncated: boolean;
  loaded: boolean;
  showingAll: boolean;
}> {
  const make = opts.make?.trim() || undefined;
  const model = opts.model?.trim() || undefined;
  const q = opts.q?.trim() || undefined;
  const yearNum = opts.year ? Number(opts.year) : undefined;
  const year =
    yearNum != null && !Number.isNaN(yearNum) ? yearNum : undefined;
  const showingAll = Boolean(opts.showAll) && !opts.dealerFacing;

  const loaded = showingAll || Boolean(make || q);
  if (!loaded) {
    return {
      rows: [],
      liveCompat: new Map(),
      truncated: false,
      loaded: false,
      showingAll: false,
    };
  }

  const where = showingAll
    ? {}
    : buildCompatibilityWhere({
        make,
        makeExact: Boolean(make),
        year,
        q,
        visibleOnly: opts.dealerFacing,
      });

  const rawRows = await prisma.vehicleCompatibility.findMany({
    where,
    orderBy: showingAll
      ? [{ updatedAt: "desc" }, { make: "asc" }, { model: "asc" }]
      : [{ make: "asc" }, { model: "asc" }, { yearFrom: "asc" }],
    ...(showingAll ? {} : { take: COMPAT_RESULT_LIMIT + 1 }),
    select: {
      id: true,
      make: true,
      model: true,
      yearFrom: true,
      yearTo: true,
      trim: true,
      engineType: true,
      transmissionType: true,
      analogBlockRequired: true,
      analogBlockType: true,
      dealerNotes: true,
      iglaProducts: true,
      isVisibleToDealers: true,
      sourceGuideId: true,
      sourceGuideStatus: true,
      updatedAt: true,
    },
  });

  let matched = model
    ? rawRows.filter((r) => modelMatchesBase(r.model, model))
    : rawRows;

  const liveCompat = await loadLiveGuideCompatInfo(
    matched.map((r) => r.sourceGuideId),
  );

  if (opts.dealerFacing) {
    matched = excludeHiddenCompatibilityRows(matched, liveCompat);
  }

  const truncated = !showingAll && matched.length > COMPAT_RESULT_LIMIT;
  const page = truncated ? matched.slice(0, COMPAT_RESULT_LIMIT) : matched;

  const rows: CompatListRow[] = page.map((r) => ({
    id: r.id,
    make: r.make,
    model: r.model,
    yearFrom: r.yearFrom,
    yearTo: r.yearTo,
    trim: r.trim,
    engineType: r.engineType,
    transmissionType: r.transmissionType,
    analogBlockRequired: r.analogBlockRequired,
    analogBlockType: r.analogBlockType,
    dealerNotes: r.dealerNotes,
    iglaProducts: r.iglaProducts,
    isVisibleToDealers: r.isVisibleToDealers,
    sourceGuideId: r.sourceGuideId,
    sourceGuideStatus: r.sourceGuideStatus,
    guideStatus:
      (r.sourceGuideId && liveCompat.get(r.sourceGuideId)?.status) ||
      r.sourceGuideStatus,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { rows, liveCompat, truncated, loaded: true, showingAll };
}

export function compatibilityQueryHref(
  path: string,
  sp: CompatListSearch,
  patch?: Partial<CompatListSearch>,
): string {
  const next = { ...sp, ...patch };
  const p = new URLSearchParams();
  if (next.make) p.set("make", next.make);
  if (next.model) p.set("model", next.model);
  if (next.year) p.set("year", next.year);
  if (next.q) p.set("q", next.q);
  if (next.view) p.set("view", next.view);
  if (next.all === "1") p.set("all", "1");
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}
