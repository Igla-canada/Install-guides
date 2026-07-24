import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import {
  baseModelName,
  listCompatibilitySearchMeta,
} from "@/lib/vehicle-compatibility";
import {
  COMPAT_RESULT_LIMIT,
  compatibilityQueryHref,
  loadCompatibilityList,
} from "@/lib/compatibility-query";
import DealerCompatibilitySearch from "@/components/compatibility/dealer-compatibility-search";
import DealerStyleCompatTable from "@/components/compatibility/dealer-style-compat-table";

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
  searchParams: Promise<{
    make?: string;
    model?: string;
    year?: string;
    q?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const user = await currentUser();
  const isStaff = user?.role === "ADMIN" || user?.role === "TECH";

  const taxonomy = await listCompatibilitySearchMeta({ visibleOnly: true });
  const { rows, truncated, loaded } = await loadCompatibilityList({
    make: sp.make,
    model: sp.model,
    year: sp.year,
    q: sp.q,
    dealerFacing: true,
  });

  const backToStaffHref = compatibilityQueryHref("/compatibility", {
    make: sp.make,
    model: sp.model,
    year: sp.year,
    q: sp.q,
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      {isStaff && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span>Staff preview — this is the public dealer page.</span>
          <div className="flex flex-wrap gap-2">
            <Link
              href={backToStaffHref}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              ← Back to Compatibility
            </Link>
            <Link
              href="/guides"
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-950 hover:bg-amber-100"
            >
              Guides
            </Link>
          </div>
        </div>
      )}
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          IGLA Canada
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
          Vehicle Compatibility List
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Quick-search by letter or name, or choose a make. Contact IGLA Canada
          for installation support.
        </p>
      </div>

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
        actionPath="/dealer/compatibility"
      />

      {!loaded ? (
        <p className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
          Type in <strong>Quick search</strong> (e.g. <strong>a</strong>) or
          choose a make, then press Search.
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
            {truncated ? (
              <span className="text-amber-800">
                {" "}
                · showing first {COMPAT_RESULT_LIMIT} — refine your search
              </span>
            ) : null}
          </p>
          <DealerStyleCompatTable rows={rows} />
        </>
      )}
    </main>
  );
}
