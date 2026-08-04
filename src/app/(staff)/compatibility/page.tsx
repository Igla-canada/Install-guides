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
    all?: string;
  }>;
}) {
  await requireRole("ADMIN", "TECH");
  const sp = await props.searchParams;
  const dealerView = sp.view === "dealer";
  const showAll = sp.all === "1" && !dealerView;

  const taxonomy = await listCompatibilitySearchMeta({
    visibleOnly: false,
    excludeArchivedGuides: false,
  });

  const { rows, truncated, loaded, showingAll } = await loadCompatibilityList({
    make: sp.make,
    model: sp.model,
    year: sp.year,
    q: sp.q,
    dealerFacing: dealerView,
    showAll,
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
    blockKind: r.blockKind,
    dealerNotes: r.dealerNotes,
    iglaProducts: r.iglaProducts,
    recommendAlarm: r.recommendAlarm,
    // Which guide the row is ("RAM 1500 Classic") and the other names it answers
    // to — read live from the guide, so they must be forwarded explicitly here.
    variantLabel: r.variantLabel,
    altModelNames: r.altModelNames,
    isVisibleToDealers: r.isVisibleToDealers,
    guideStatus: r.guideStatus,
    updatedAt: r.updatedAt,
  }));

  function hrefWith(patch: {
    make?: string;
    model?: string;
    year?: string;
    q?: string;
    view?: string;
    all?: string;
  }) {
    const p = new URLSearchParams();
    const next = {
      make: sp.make,
      model: sp.model,
      year: sp.year,
      q: sp.q,
      view: dealerView ? "dealer" : undefined,
      all: showAll ? "1" : undefined,
      ...patch,
    };
    if (next.make) p.set("make", next.make);
    if (next.model) p.set("model", next.model);
    if (next.year) p.set("year", next.year);
    if (next.q) p.set("q", next.q);
    if (next.view) p.set("view", next.view);
    if (next.all === "1") p.set("all", "1");
    const qs = p.toString();
    return qs ? `/compatibility?${qs}` : "/compatibility";
  }

  // Switching to dealer view drops all=1 (full list is staff-only).
  const viewToggleClean = (() => {
    const p = new URLSearchParams();
    if (sp.make) p.set("make", sp.make);
    if (sp.model) p.set("model", sp.model);
    if (sp.year) p.set("year", sp.year);
    if (sp.q) p.set("q", sp.q);
    if (!dealerView) p.set("view", "dealer");
    else if (showAll) p.set("all", "1");
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
                Staff view — hide/show for dealers. Page stays light until you
                search or click <strong>Show all vehicles</strong>. Full
                editing:{" "}
                <Link href="/users?tab=compatibility" className="underline">
                  Admin → Vehicle Compatibility
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!dealerView && (
            <Link
              href={
                showingAll
                  ? hrefWith({ all: undefined, make: undefined, model: undefined, q: undefined, year: undefined })
                  : "/compatibility?all=1"
              }
              className={`rounded-md px-3 py-1.5 text-sm ${
                showingAll
                  ? "border border-zinc-300 bg-white hover:bg-zinc-50"
                  : "border border-zinc-900 bg-white font-medium text-zinc-900 hover:bg-zinc-100"
              }`}
              title={
                showingAll
                  ? "Clear full list"
                  : "Load every vehicle once — sorted by last change (not on every visit)"
              }
            >
              {showingAll ? "Clear full list" : "Show all vehicles"}
            </Link>
          )}
          <Link
            href={viewToggleClean}
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
            target="_blank"
            rel="noopener noreferrer"
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
          extraParams={{
            ...(dealerView ? { view: "dealer" } : {}),
            // Searching replaces “show all” so filters stay intentional.
          }}
        />
      </div>

      {!loaded ? (
        <div className="mt-8 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          <p>
            Choose a make, use <strong>Quick search</strong>, or click{" "}
            <strong>Show all vehicles</strong> when you want the full list
            (sorted by most recently updated — so your last changes are on top).
          </p>
          <Link
            href="/compatibility?all=1"
            className="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Show all vehicles
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-zinc-600">
            <span className="font-semibold tabular-nums text-zinc-900">
              {rows.length}
            </span>{" "}
            vehicle{rows.length === 1 ? "" : "s"}
            {showingAll ? (
              <span className="text-zinc-500">
                {" "}
                · all vehicles · newest changes first
              </span>
            ) : null}
            {truncated ? (
              <span className="text-amber-800">
                {" "}
                · showing first {COMPAT_RESULT_LIMIT} — add more letters, pick a
                make, or use Show all
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
