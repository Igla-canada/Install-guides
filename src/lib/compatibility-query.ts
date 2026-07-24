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
};

/**
 * Load compatibility rows for staff/dealer pages.
 * Requires make and/or free-text `q` — never loads the unfiltered full table.
 */
export async function loadCompatibilityList(opts: {
  make?: string;
  model?: string;
  year?: string;
  q?: string;
  /** Dealer / public: only dealer-visible + not guide-hidden. */
  dealerFacing: boolean;
}): Promise<{
  rows: CompatListRow[];
  liveCompat: Map<string, LiveGuideCompatInfo>;
  truncated: boolean;
  loaded: boolean;
}> {
  const make = opts.make?.trim() || undefined;
  const model = opts.model?.trim() || undefined;
  const q = opts.q?.trim() || undefined;
  const yearNum = opts.year ? Number(opts.year) : undefined;
  const year =
    yearNum != null && !Number.isNaN(yearNum) ? yearNum : undefined;

  const loaded = Boolean(make || q);
  if (!loaded) {
    return {
      rows: [],
      liveCompat: new Map(),
      truncated: false,
      loaded: false,
    };
  }

  const where = buildCompatibilityWhere({
    make,
    makeExact: Boolean(make),
    year,
    q,
    visibleOnly: opts.dealerFacing,
  });

  const rawRows = await prisma.vehicleCompatibility.findMany({
    where,
    orderBy: [{ make: "asc" }, { model: "asc" }, { yearFrom: "asc" }],
    take: COMPAT_RESULT_LIMIT + 1,
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

  const truncated = matched.length > COMPAT_RESULT_LIMIT;
  const page = truncated ? matched.slice(0, COMPAT_RESULT_LIMIT) : matched;

  const rows: CompatListRow[] = page.map((r) => ({
    ...r,
    guideStatus:
      (r.sourceGuideId && liveCompat.get(r.sourceGuideId)?.status) ||
      r.sourceGuideStatus,
  }));

  return { rows, liveCompat, truncated, loaded: true };
}

export function compatibilityQueryHref(
  path: string,
  sp: {
    make?: string;
    model?: string;
    year?: string;
    q?: string;
    view?: string;
  },
  patch?: Partial<{ make: string; model: string; year: string; q: string; view: string }>,
): string {
  const next = { ...sp, ...patch };
  const p = new URLSearchParams();
  if (next.make) p.set("make", next.make);
  if (next.model) p.set("model", next.model);
  if (next.year) p.set("year", next.year);
  if (next.q) p.set("q", next.q);
  if (next.view) p.set("view", next.view);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}
