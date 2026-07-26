"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { setCompatibilityVisibilityBulk } from "@/lib/vehicle-compatibility-actions";
import {
  baseModelName,
  formatIglaProducts,
  yearsLabel,
} from "@/lib/vehicle-compatibility";

export type StaffCompatRow = {
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
  updatedAt?: string;
};

type SortKey = "vehicle" | "guide" | "updated" | "hide";
type SortDir = "asc" | "desc";

function vehicleLabel(r: StaffCompatRow) {
  return `${r.make} ${baseModelName(r.model)}`.trim();
}

/** Published first when asc; unpublished/missing last. */
function guideRank(status: string | null) {
  if (status === "PUBLISHED") return 0;
  if (status === "DRAFT") return 1;
  if (status === "ARCHIVED") return 2;
  return 3;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  title?: string;
}) {
  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={onClick}
        title={title ?? `Sort by ${label}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-zinc-800 ${
          active ? "font-semibold text-zinc-800" : "font-medium text-zinc-500"
        }`}
      >
        {label}
        <span className="text-[10px] tabular-nums" aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "◇"}
        </span>
      </button>
    </th>
  );
}

/**
 * Staff compatibility list with quick single / multi / select-all
 * hide-from-dealers controls (does not edit guides).
 */
export default function StaffCompatibilityTable({
  initialRows,
}: {
  initialRows: StaffCompatRow[];
  /** @deprecated Always shows Updated now (sortable). Kept for call-site compat. */
  showUpdated?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(true);
  const [pending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    setRows(initialRows);
    setSelected(new Set());
  }, [initialRows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Sensible first click: A→Z, published first, newest first, hidden first
      setSortDir(
        key === "updated" || key === "hide" ? "desc" : "asc",
      );
    }
  }

  const visibleRows = useMemo(() => {
    const filtered = showHidden
      ? rows
      : rows.filter((r) => r.isVisibleToDealers);
    if (!sortKey) return filtered;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "vehicle") {
        cmp = vehicleLabel(a).localeCompare(vehicleLabel(b), undefined, {
          sensitivity: "base",
        });
      } else if (sortKey === "guide") {
        cmp =
          guideRank(a.guideStatus) - guideRank(b.guideStatus) ||
          (a.guideStatus ?? "").localeCompare(b.guideStatus ?? "");
      } else if (sortKey === "updated") {
        const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        cmp = ta - tb;
      } else if (sortKey === "hide") {
        // hidden (not visible) vs shown
        cmp =
          Number(!a.isVisibleToDealers) - Number(!b.isVisibleToDealers);
      }
      if (cmp !== 0) return cmp * dir;
      return vehicleLabel(a).localeCompare(vehicleLabel(b));
    });
  }, [rows, showHidden, sortKey, sortDir]);

  const ids = visibleRows.map((r) => r.id);
  const selectedInView = ids.filter((id) => selected.has(id));
  const allSelected = ids.length > 0 && selectedInView.length === ids.length;
  const someSelected = selectedInView.length > 0 && !allSelected;

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }

  function applyVisibility(
    visible: boolean,
    targetIds: string[],
    clearSelection = true,
  ) {
    if (!targetIds.length) return;
    startTransition(async () => {
      const res = await setCompatibilityVisibilityBulk(targetIds, visible);
      if (!res.ok) return;
      const idSet = new Set(targetIds);
      setRows((prev) =>
        prev.map((r) =>
          idSet.has(r.id) ? { ...r, isVisibleToDealers: visible } : r,
        ),
      );
      if (clearSelection) setSelected(new Set());
    });
  }

  const dealerVisibleCount = rows.filter((r) => r.isVisibleToDealers).length;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
        <span>
          <span className="font-semibold tabular-nums text-zinc-900">
            {visibleRows.length}
          </span>{" "}
          shown
          <span className="text-zinc-400">
            {" "}
            · {dealerVisibleCount} visible to dealers
          </span>
        </span>
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden rows
        </label>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums text-zinc-800">
            {selected.size} selected
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => applyVisibility(false, [...selected])}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
          >
            Hide from dealers
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => applyVisibility(true, [...selected])}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
          >
            Show to dealers
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-zinc-500 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="w-10 px-2 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  title="Select all in this list"
                  aria-label="Select all"
                />
              </th>
              <SortHeader
                label="Vehicle"
                active={sortKey === "vehicle"}
                dir={sortDir}
                onClick={() => toggleSort("vehicle")}
                title="Sort A–Z / Z–A"
              />
              <th className="px-3 py-2 font-medium">Years</th>
              <th className="px-3 py-2 font-medium">IGLA</th>
              <SortHeader
                label="Guide"
                active={sortKey === "guide"}
                dir={sortDir}
                onClick={() => toggleSort("guide")}
                title="Sort published / draft / archived"
              />
              <th className="px-3 py-2 font-medium">Trim / config</th>
              <th className="px-3 py-2 font-medium">Analog</th>
              <SortHeader
                label="Updated"
                active={sortKey === "updated"}
                dir={sortDir}
                onClick={() => toggleSort("updated")}
                title="Sort by last change"
              />
              <SortHeader
                label="Hide"
                active={sortKey === "hide"}
                dir={sortDir}
                onClick={() => toggleSort("hide")}
                title="Sort hidden vs visible to dealers"
              />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const base = baseModelName(r.model);
              const hidden = !r.isVisibleToDealers;
              const isSelected = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`border-b border-zinc-100 last:border-0 ${
                    hidden
                      ? "bg-zinc-50 text-zinc-500"
                      : isSelected
                        ? "bg-sky-50/70"
                        : ""
                  }`}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        });
                      }}
                      aria-label={`Select ${r.make} ${base}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-zinc-900">
                    <div>
                      {r.make} {base}
                    </div>
                    {base !== r.model.trim() && (
                      <div className="text-xs font-normal text-zinc-500">
                        {r.model}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {yearsLabel(r.yearFrom, r.yearTo)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">
                    {formatIglaProducts(r.iglaProducts)}
                  </td>
                  <td className="px-3 py-2">
                    {r.guideStatus ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.guideStatus === "PUBLISHED"
                            ? "bg-green-100 text-green-800"
                            : r.guideStatus === "DRAFT"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {r.guideStatus.toLowerCase()}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {[r.trim, r.engineType, r.transmissionType]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.analogBlockRequired
                      ? `Required${r.analogBlockType ? ` · ${r.analogBlockType}` : ""}`
                      : "Not required"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-zinc-500">
                    {r.updatedAt ? r.updatedAt.slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <label
                      className="inline-flex cursor-pointer items-center gap-1.5 text-xs"
                      title="Hide this vehicle from the dealer compatibility list"
                    >
                      <input
                        type="checkbox"
                        checked={hidden}
                        disabled={pending}
                        onChange={() =>
                          applyVisibility(hidden, [r.id], false)
                        }
                      />
                      <span
                        className={
                          hidden ? "font-medium text-zinc-800" : "text-zinc-400"
                        }
                      >
                        {hidden ? "hidden" : "hide"}
                      </span>
                    </label>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-zinc-500"
                >
                  No compatibility records match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
