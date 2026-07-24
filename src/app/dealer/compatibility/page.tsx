import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import {
  baseModelName,
  buildCompatibilityWhere,
  excludeHiddenCompatibilityRows,
  formatIglaProducts,
  listCompatibilitySearchMeta,
  loadLiveGuideCompatInfo,
  modelMatchesBase,
  yearsLabel,
} from "@/lib/vehicle-compatibility";
import DealerCompatibilitySearch from "@/components/compatibility/dealer-compatibility-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vehicle Compatibility",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default async function DealerCompatibilityPage(props: {
  searchParams: Promise<{ make?: string; model?: string; year?: string }>;
}) {
  const sp = await props.searchParams;
  const yearNum = sp.year ? Number(sp.year) : undefined;
  const hasMake = Boolean(sp.make?.trim());

  // Dropdowns only — never dump the full ~800-row table on first paint
  // (that was wedging localhost / timing out).
  const taxonomy = await listCompatibilitySearchMeta({ visibleOnly: true });

  let rows: Array<{
    id: string;
    make: string;
    model: string;
    yearFrom: number;
    yearTo: number | null;
    analogBlockRequired: boolean;
    analogBlockType: string | null;
    iglaProducts: string[];
    dealerNotes: string | null;
    sourceGuideId: string | null;
    sourceGuideStatus: string | null;
  }> = [];
  let liveCompat = new Map<
    string,
    { status: string; hideFromCompatibility: boolean }
  >();

  if (hasMake) {
    const where = buildCompatibilityWhere({
      make: sp.make,
      year: yearNum != null && !Number.isNaN(yearNum) ? yearNum : undefined,
      makeExact: true,
      visibleOnly: true,
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
        analogBlockRequired: true,
        analogBlockType: true,
        iglaProducts: true,
        dealerNotes: true,
        sourceGuideId: true,
        sourceGuideStatus: true,
      },
    });
    const matched = sp.model
      ? rawRows.filter((r) => modelMatchesBase(r.model, sp.model!))
      : rawRows;
    liveCompat = await loadLiveGuideCompatInfo(
      matched.map((r) => r.sourceGuideId),
    );
    rows = excludeHiddenCompatibilityRows(matched, liveCompat);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          IGLA Canada
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
          Vehicle Compatibility List
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Choose a make (and optionally model / year), then search. Contact IGLA
          Canada for installation support.
        </p>
      </div>

      <DealerCompatibilitySearch
        makes={taxonomy.makes}
        modelsByMake={taxonomy.modelsByMake}
        yearOptions={taxonomy.yearOptions}
        initial={{ make: sp.make, model: sp.model, year: sp.year }}
        actionPath="/dealer/compatibility"
      />

      {!hasMake ? (
        <p className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Select a <strong>make</strong> above and press Search to see matching
          vehicles.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-zinc-600">
            <span className="font-semibold tabular-nums text-zinc-900">
              {rows.length}
            </span>{" "}
            option{rows.length === 1 ? "" : "s"} matching
            {sp.model ? (
              <>
                {" "}
                ·{" "}
                <span className="font-medium text-zinc-800">
                  {baseModelName(sp.model)}
                </span>
              </>
            ) : null}
          </p>

          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Make / model</th>
                  <th className="whitespace-nowrap px-3 py-2">Years</th>
                  <th className="whitespace-nowrap px-3 py-2">IGLA</th>
                  <th className="whitespace-nowrap px-3 py-2">Analog</th>
                  <th className="whitespace-nowrap px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const guideStatus =
                    (r.sourceGuideId &&
                      liveCompat.get(r.sourceGuideId)?.status) ||
                    r.sourceGuideStatus;
                  const guideNotPublished =
                    Boolean(guideStatus) && guideStatus !== "PUBLISHED";
                  const base = baseModelName(r.model);

                  return (
                    <tr
                      key={r.id}
                      className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/80"
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium text-zinc-900">
                        {r.make} {base}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-800">
                        {yearsLabel(r.yearFrom, r.yearTo)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-zinc-800">
                        {formatIglaProducts(r.iglaProducts)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-zinc-600">
                        {r.analogBlockRequired
                          ? r.analogBlockType || "Required"
                          : "—"}
                      </td>
                      <td className="max-w-[16rem] px-3 py-1.5 text-xs text-zinc-600">
                        {guideNotPublished ? (
                          <span
                            className="text-amber-800"
                            title="Installation guide is not published yet. Contact IGLA Canada for support, or ask us to publish the guide so you can view it."
                          >
                            Guide not published — contact us
                            {r.dealerNotes ? ` · ${r.dealerNotes}` : ""}
                          </span>
                        ) : (
                          <span
                            className="block truncate"
                            title={r.dealerNotes || undefined}
                          >
                            {r.dealerNotes || "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-zinc-500"
                    >
                      No dealer-visible compatibility records match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
