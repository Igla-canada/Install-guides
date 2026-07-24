"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type CascadeOption = { value: string; label: string };

function asOptions(list: Array<string | CascadeOption>): CascadeOption[] {
  return list.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
}

export type CascadeFilter = {
  make: string;
  model: string;
  year: string;
  q: string;
};

/**
 * Shared Make → Model → Year search (dealer list, admin compatibility, guides).
 * - URL mode: pass `actionPath` (and optional `extraParams`)
 * - Client mode: pass `onApply` (admin in-page filter)
 */
export default function VehicleCascadeSearch({
  makes,
  modelsByMake,
  yearOptions,
  initial,
  actionPath,
  extraParams,
  onApply,
  searchLabel = "Search",
  makeEmptyLabel = "All makes",
  modelEmptyLabel = "All models",
  showTextSearch = false,
  textSearchPlaceholder = "Type to search (e.g. a, RAV4, BMW)…",
}: {
  makes: Array<string | CascadeOption>;
  modelsByMake: Record<string, Array<string | CascadeOption>>;
  yearOptions: number[];
  initial?: { make?: string; model?: string; year?: string; q?: string };
  /** URL navigation target (dealer / guides). Ignored when `onApply` is set. */
  actionPath?: string;
  /** Extra query params preserved on Search/Clear (e.g. status=DRAFT). */
  extraParams?: Record<string, string | undefined>;
  /** Client-side apply (admin). When set, does not change the URL. */
  onApply?: (filter: CascadeFilter) => void;
  searchLabel?: string;
  makeEmptyLabel?: string;
  modelEmptyLabel?: string;
  /** Free-text search box (compatibility lists). */
  showTextSearch?: boolean;
  textSearchPlaceholder?: string;
}) {
  const router = useRouter();
  const makeOpts = useMemo(() => asOptions(makes), [makes]);
  const [make, setMake] = useState(initial?.make ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [year, setYear] = useState(initial?.year ?? "");
  const [q, setQ] = useState(initial?.q ?? "");

  useEffect(() => {
    setMake(initial?.make ?? "");
    setModel(initial?.model ?? "");
    setYear(initial?.year ?? "");
    setQ(initial?.q ?? "");
  }, [initial?.make, initial?.model, initial?.year, initial?.q]);

  const models = useMemo(() => {
    if (!make) {
      const all = new Map<string, string>();
      for (const list of Object.values(modelsByMake)) {
        for (const o of asOptions(list)) all.set(o.value, o.label);
      }
      return [...all.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    return asOptions(modelsByMake[make] ?? []).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [make, modelsByMake]);

  // Keep <select value> in the option list so SSR HTML matches the client.
  const makeValue = makeOpts.some((m) => m.value === make) ? make : "";
  const modelValue = models.some((m) => m.value === model) ? model : "";
  const yearValue = yearOptions.some((y) => String(y) === year) ? year : "";
  const qValue = q.trim();

  function buildParams(filter: CascadeFilter) {
    const p = new URLSearchParams();
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) p.set(k, v);
      }
    }
    if (filter.make) p.set("make", filter.make);
    if (filter.model) p.set("model", filter.model);
    if (filter.year) p.set("year", filter.year);
    if (filter.q) p.set("q", filter.q);
    return p;
  }

  function apply() {
    const filter = {
      make: makeValue,
      model: modelValue,
      year: yearValue,
      q: qValue,
    };
    if (onApply) {
      onApply(filter);
      return;
    }
    if (!actionPath) return;
    const qs = buildParams(filter).toString();
    router.push(qs ? `${actionPath}?${qs}` : actionPath);
  }

  function clear() {
    setMake("");
    setModel("");
    setYear("");
    setQ("");
    if (onApply) {
      onApply({ make: "", model: "", year: "", q: "" });
      return;
    }
    if (!actionPath) return;
    const p = new URLSearchParams();
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) p.set(k, v);
      }
    }
    const qs = p.toString();
    router.push(qs ? `${actionPath}?${qs}` : actionPath);
  }

  const hasFilter = Boolean(makeValue || modelValue || yearValue || qValue);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
      {showTextSearch && (
        <label className="mb-2 block text-sm">
          <span className="text-xs font-medium text-zinc-500">
            Quick search
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            placeholder={textSearchPlaceholder}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[10rem] flex-1 text-sm">
          <span className="text-xs font-medium text-zinc-500">Make</span>
          <select
            value={makeValue}
            onChange={(e) => {
              setMake(e.target.value);
              setModel("");
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">{makeEmptyLabel}</option>
            {makeOpts.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-[10rem] flex-1 text-sm">
          <span className="text-xs font-medium text-zinc-500">Model</span>
          <select
            value={modelValue}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">{modelEmptyLabel}</option>
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block w-36 text-sm">
          <span className="text-xs font-medium text-zinc-500">
            Year (optional)
          </span>
          <select
            value={yearValue}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Any year</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={apply}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          {searchLabel}
        </button>
        {hasFilter &&
          (onApply || !actionPath ? (
            <button
              type="button"
              onClick={clear}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600"
            >
              Clear
            </button>
          ) : (
            <Link
              href={(() => {
                const p = new URLSearchParams();
                if (extraParams) {
                  for (const [k, v] of Object.entries(extraParams)) {
                    if (v) p.set(k, v);
                  }
                }
                const qs = p.toString();
                return qs ? `${actionPath}?${qs}` : actionPath!;
              })()}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600"
            >
              Clear
            </Link>
          ))}
      </div>
    </div>
  );
}
