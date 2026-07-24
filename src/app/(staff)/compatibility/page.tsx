import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildCompatibilityWhere,
  listCompatibilitySearchMeta,
  loadLiveGuideCompatInfo,
  modelMatchesBase,
} from "@/lib/vehicle-compatibility";
import DealerCompatibilitySearch from "@/components/compatibility/dealer-compatibility-search";
import StaffCompatibilityTable from "@/components/compatibility/staff-compatibility-table";

export default async function StaffCompatibilityPage(props: {
  searchParams: Promise<{ make?: string; model?: string; year?: string }>;
}) {
  await requireRole("ADMIN", "TECH");
  const sp = await props.searchParams;
  const yearNum = sp.year ? Number(sp.year) : undefined;
  const hasMake = Boolean(sp.make?.trim());

  // Light dropdown meta only — full table loads after a make is chosen
  // (loading all ~800 rows on every visit was hanging localhost).
  const taxonomy = await listCompatibilitySearchMeta({
    visibleOnly: false,
    excludeArchivedGuides: false,
  });

  let tableRows: Array<{
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
    guideStatus: string | null;
  }> = [];

  if (hasMake) {
    const where = buildCompatibilityWhere({
      make: sp.make,
      year: yearNum != null && !Number.isNaN(yearNum) ? yearNum : undefined,
      makeExact: true,
      visibleOnly: false,
    });
    const rawRows = await prisma.vehicleCompatibility.findMany({
      where,
      orderBy: [{ make: "asc" }, { model: "asc" }, { yearFrom: "asc" }],
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
    const matched = sp.model
      ? rawRows.filter((r) => modelMatchesBase(r.model, sp.model!))
      : rawRows;
    const liveCompat = await loadLiveGuideCompatInfo(
      matched.map((r) => r.sourceGuideId),
    );
    tableRows = matched.map((r) => ({
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
      guideStatus:
        (r.sourceGuideId && liveCompat.get(r.sourceGuideId)?.status) ||
        r.sourceGuideStatus,
    }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vehicle Compatibility</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pick a make, then use <strong>Hide from dealers</strong> on one row
            or select several / all. Full record editing is under{" "}
            <Link href="/users?tab=compatibility" className="underline">
              Admin → Vehicle Compatibility
            </Link>
            .
          </p>
        </div>
        <Link
          href="/dealer/compatibility"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          Open public dealer page
        </Link>
      </div>

      <div className="mt-4">
        <DealerCompatibilitySearch
          makes={taxonomy.makes}
          modelsByMake={taxonomy.modelsByMake}
          yearOptions={taxonomy.yearOptions}
          initial={{ make: sp.make, model: sp.model, year: sp.year }}
          actionPath="/compatibility"
        />
      </div>

      {!hasMake ? (
        <p className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Select a <strong>make</strong> and press Search to load vehicles for
          that brand (keeps this page fast).
        </p>
      ) : (
        <StaffCompatibilityTable initialRows={tableRows} />
      )}
    </div>
  );
}
