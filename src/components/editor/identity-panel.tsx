"use client";
// Identity layer editor — dropdown-only (AGENTS.md #1). "Go back and fix" for
// the wizard answers: any identity field is editable here at any time.
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ClientDoc } from "./types";
import type { Taxonomy } from "@/lib/taxonomy";

export default function IdentityPanel({
  doc,
  taxonomy,
  open,
  onToggle,
  dispatch,
}: {
  doc: ClientDoc;
  taxonomy: Taxonomy;
  open: boolean;
  onToggle: () => void;
  dispatch: (ops: any[]) => Promise<void>;
}) {
  const make = taxonomy.makes.find((m) => m.id === doc.makeId);
  const model = make?.models.find((m) => m.id === doc.modelId);
  const generation = model?.generations.find((g) => g.id === doc.generationId);

  const set = (data: Record<string, string | null>) =>
    void dispatch([{ op: "update_identity", data }]);

  const setGen = (data: { name?: string; yearStart?: number; yearEnd?: number | null }) =>
    void dispatch([{ op: "update_generation", ...data }]);

  const selectedProductIds = doc.products?.length
    ? doc.products.map((p) => p.iglaProductId)
    : [doc.iglaProductId];
  const toggleProduct = (id: string) => {
    const next = selectedProductIds.includes(id)
      ? selectedProductIds.filter((x) => x !== id)
      : [...selectedProductIds, id];
    if (next.length === 0) return; // keep at least one
    void dispatch([{ op: "set_products", productIds: next }]);
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <input
            value={doc.title}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => set({ title: e.target.value })}
            className="w-full truncate border-0 bg-transparent text-xl font-semibold focus:outline-none"
          />
          <p className="truncate text-xs text-zinc-500">
            {doc.make.name} {doc.model.name} {doc.generation.name}
            {doc.trim ? ` · ${doc.trim.name}` : ""} ·{" "}
            {doc.iglaProduct.productLine.name} {doc.iglaProduct.name} ·{" "}
            {doc.region.name}
          </p>
        </div>
        <span className="text-sm text-zinc-400">{open ? "▲" : "▼ identity"}</span>
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-zinc-100 p-4 sm:grid-cols-2">
          <Select
            label="Make"
            value={doc.makeId}
            onChange={(v) => set({ makeId: v })}
            options={taxonomy.makes.map((m) => ({ value: m.id, label: m.name }))}
          />
          <Select
            label="Model"
            value={doc.modelId}
            onChange={(v) => set({ modelId: v })}
            options={(make?.models ?? []).map((m) => ({
              value: m.id,
              label: m.name,
            }))}
          />
          <Select
            label="Generation"
            value={doc.generationId}
            onChange={(v) => set({ generationId: v })}
            options={(() => {
              // The taxonomy prop is the snapshot from page load, so the option
              // label for the generation we're editing here goes stale the
              // moment its years change. Render the selected one from the live
              // doc instead so the dropdown tracks the "Generation years" edits.
              const gens = model?.generations ?? [];
              const opts = gens.map((g) => {
                const cur = g.id === doc.generationId;
                const name = cur ? doc.generation.name : g.name;
                const ys = cur ? doc.generation.yearStart : g.yearStart;
                const ye = cur ? doc.generation.yearEnd : g.yearEnd;
                return { value: g.id, label: `${name} (${ys}–${ye ?? "now"})` };
              });
              // Safety: keep the current generation selectable even if it isn't
              // in the (stale) taxonomy list yet.
              if (!opts.some((o) => o.value === doc.generationId)) {
                opts.unshift({
                  value: doc.generationId,
                  label: `${doc.generation.name} (${doc.generation.yearStart}–${doc.generation.yearEnd ?? "now"})`,
                });
              }
              return opts;
            })()}
          />
          {/* Adjust the selected generation's real years so the Igla app stops
              matching it past its end (e.g. a 2023–2025 guide shouldn't answer
              for a 2027). Remounts when you switch generation. */}
          <div
            key={doc.generationId}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:col-span-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-medium text-zinc-500">Generation years</span>
              <span className="text-xs text-zinc-400">
                which model-years the Igla app matches
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs text-zinc-500">
                Label
                <input
                  defaultValue={doc.generation.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== doc.generation.name) setGen({ name: v });
                  }}
                  className="mt-1 w-40 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col text-xs text-zinc-500">
                From
                <input
                  type="number"
                  defaultValue={doc.generation.yearStart}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n) && n !== doc.generation.yearStart)
                      setGen({ yearStart: n });
                  }}
                  className="mt-1 w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col text-xs text-zinc-500">
                To (blank = now)
                <input
                  type="number"
                  defaultValue={doc.generation.yearEnd ?? ""}
                  placeholder="now"
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const next = raw ? parseInt(raw, 10) : null;
                    if (next !== null && Number.isNaN(next)) return;
                    if (next !== doc.generation.yearEnd) setGen({ yearEnd: next });
                  }}
                  className="mt-1 w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">
              Shared across every guide that uses the {doc.model.name}{" "}
              “{doc.generation.name}” generation.
            </p>
          </div>
          <Select
            label="Trim (optional)"
            value={doc.trimId ?? ""}
            onChange={(v) => set({ trimId: v || null })}
            options={[
              { value: "", label: "Whole generation" },
              ...(generation?.trims ?? []).map((t) => ({
                value: t.id,
                label: t.name,
              })),
            ]}
          />
          <div className="sm:col-span-2">
            <span className="text-xs font-medium text-zinc-500">Igla product(s)</span>
            <div className="mt-1 space-y-2 rounded-md border border-zinc-300 bg-white p-2">
              {taxonomy.productLines.map((pl) => (
                <div key={pl.id}>
                  <div className="text-xs font-medium uppercase text-zinc-400">{pl.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {pl.products.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(p.id)}
                          onChange={() => toggleProduct(p.id)}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              The guide is served for any ticked product. First ticked is the primary.
            </p>
          </div>
          <Select
            label="Region"
            value={doc.regionId}
            onChange={(v) => set({ regionId: v })}
            options={taxonomy.regions.map((r) => ({ value: r.id, label: r.name }))}
          />
          <p className="text-xs text-zinc-400 sm:col-span-2">
            These fields drive the Igla app&apos;s automatic guide lookup. New
            makes/models/years are created from the New-guild form; this panel
            re-points an existing guild.
          </p>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
