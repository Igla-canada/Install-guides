import Link from "next/link";
import { requireRole } from "@/lib/auth";
import {
  COMPAT_RESULT_LIMIT,
  compatibilityQueryHref,
  loadCompatibilityList,
} from "@/lib/compatibility-query";
import { listCompatibilitySearchMeta } from "@/lib/vehicle-compatibility";
import DealerCompatibilitySearch from "@/components/compatibility/dealer-compatibility-search";
import DealerStyleCompatTable from "@/components/compatibility/dealer-style-compat-table";
import StaffCompatibilityTable from "@/components/compatibility/staff-compatibility-table";

export default async function StaffCompatibilityPage(props: {
  searchParams: Promise<{
    make?: string;
    model?: string;
    year?: string;
    q?: string;
    view?: string;
  }>;
}) {
  await requireRole("ADMIN", "TECH");
  const sp = await props.searchParams;
  const dealerView = sp.view === "dealer";

  const taxonomy = await listCompatibilitySearchMeta({
    visibleOnly: false,
    excludeArchivedGuides: false,
  });

  const { rows, truncated, loaded } = await loadCompatibilityList({
    make: sp.make,
    model: sp.model,
    year: sp.year,
    q: sp.q,
    // Dealer preview only shows what dealers would see.
    dealerFacing: dealerView,
  });

  const staffRows = rows.map((r) => ({
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
    guideStatus: r.guideStatus,
  }));

  const viewToggleHref = (() => {
    const p = new URLSearchParams();
    if (sp.make) p.set("make", sp.make);
    if (sp.model) p.set("model", sp.model);
    if (sp.year) p.set("year", sp.year);
    if (sp.q) p.set("q", sp.q);
    if (!dealerView) p.set("view", "dealer");
    const qs = p.toString();
    return qs ? `/compatibility?${qs}` : "/compatibility";
  })();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vehicle Compatibility</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {dealerView ? (
              <>
                <strong>Dealer view</strong> — exactly what dealers see (hidden
                rows omitted). Switch back to manage hide/show.
              </>
            ) : (
              <>
                Staff view — hide/show for dealers. Use quick search or pick a
                make. Full editing:{" "}
                <Link href="/users?tab=compatibility" className="underline">
                  Admin → Vehicle Compatibility
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={viewToggleHref}
            className={`rounded-md px-3 py-1.5 text-sm ${
              dealerView
                ? "border border-zinc-300 bg-white hover:bg-zinc-50"
                : "bg-zinc-900 text-white hover:bg-zinc-700"
            }`}
          >
            {dealerView ? "Staff view" : "Dealer view"}
          </Link>
          <Link
            href={compatibilityQueryHref("/dealer/compatibility", {
              make: sp.make,
              model: sp.model,
              year: sp.year,
              q: sp.q,
            })}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Open public page
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <DealerCompatibilitySearch
          makes={taxonomy.makes}
          modelsByMake={taxonomy.modelsByMake}
          yearOptions={taxonomy.yearOptions}
          initial={{
            make: sp.make,
            model: sp.model,
            year: sp.year,
            q: sp.q,
          }}
          actionPath="/compatibility"
          extraParams={dealerView ? { view: "dealer" } : undefined}
        />
      </div>

      {!loaded ? (
        <p className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Choose a make, or type in <strong>Quick search</strong> (even one
          letter) and press Search. Results are capped so the page stays fast.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-zinc-600">
            <span className="font-semibold tabular-nums text-zinc-900">
              {rows.length}
            </span>{" "}
            vehicle{rows.length === 1 ? "" : "s"}
            {truncated ? (
              <span className="text-amber-800">
                {" "}
                · showing first {COMPAT_RESULT_LIMIT} — add more letters or pick
                a make to narrow
              </span>
            ) : null}
            {dealerView ? (
              <span className="text-zinc-400"> · dealer-visible only</span>
            ) : null}
          </p>
          {dealerView ? (
            <DealerStyleCompatTable rows={rows} />
          ) : (
            <StaffCompatibilityTable initialRows={staffRows} />
          )}
        </>
      )}
    </div>
  );
}
