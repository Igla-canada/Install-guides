import {
  baseModelName,
  formatIglaProducts,
  yearsLabel,
} from "@/lib/vehicle-compatibility";
import type { CompatListRow } from "@/lib/compatibility-query";

/** Read-only table matching the public dealer list look. */
export default function DealerStyleCompatTable({
  rows,
}: {
  rows: CompatListRow[];
}) {
  return (
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
            const guideNotPublished =
              Boolean(r.guideStatus) && r.guideStatus !== "PUBLISHED";
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
                    <span className="text-amber-800">
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
                No matching vehicles.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
