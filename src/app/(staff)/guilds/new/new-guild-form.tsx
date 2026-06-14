"use client";
// Type-or-pick guild creation: free typing with suggestions from the existing
// taxonomy (datalists). Anything new is auto-created server-side — no
// taxonomy pre-setup. The product list stays a fixed dropdown (real catalog).

import { useMemo, useState } from "react";
import type { Taxonomy } from "@/lib/taxonomy";

export default function NewGuildForm({
  taxonomy,
  action,
}: {
  taxonomy: Taxonomy;
  action: (formData: FormData) => Promise<void>;
}) {
  const [makeName, setMakeName] = useState("");
  const [modelName, setModelName] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const toggleProduct = (id: string) =>
    setProductIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const knownMake = taxonomy.makes.find(
    (m) => m.name.toLowerCase() === makeName.trim().toLowerCase()
  );
  const modelSuggestions = knownMake
    ? knownMake.models.map((m) => m.name)
    : taxonomy.makes.flatMap((m) => m.models.map((x) => x.name));
  const knownModel = knownMake?.models.find(
    (m) => m.name.toLowerCase() === modelName.trim().toLowerCase()
  );
  const yearHints = knownModel
    ? knownModel.generations.map((g) =>
        g.yearEnd ? `${g.yearStart}–${g.yearEnd}` : `${g.yearStart}+`
      )
    : [];

  const suggestedTitle = useMemo(() => {
    if (!makeName.trim() || !modelName.trim()) return "";
    const selected = taxonomy.productLines
      .flatMap((pl) => pl.products)
      .filter((p) => productIds.includes(p.id));
    return [
      makeName.trim(),
      modelName.trim(),
      yearFrom ? (yearTo ? `${yearFrom}–${yearTo}` : yearFrom) : "",
      selected.length ? `— ${selected.map((p) => p.name).join(" + ")}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }, [makeName, modelName, yearFrom, yearTo, productIds, taxonomy.productLines]);

  const effectiveTitle = titleTouched ? title : suggestedTitle;

  return (
    <form action={action} className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make">
          <input
            name="makeName"
            required
            list="make-list"
            value={makeName}
            onChange={(e) => setMakeName(e.target.value)}
            placeholder="e.g. BMW"
            className={inputCls}
            autoComplete="off"
          />
          <datalist id="make-list">
            {taxonomy.makes.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Model">
          <input
            name="modelName"
            required
            list="model-list"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="e.g. X5"
            className={inputCls}
            autoComplete="off"
          />
          <datalist id="model-list">
            {[...new Set(modelSuggestions)].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From year">
          <input
            name="yearFrom"
            required
            type="number"
            min={1950}
            max={2100}
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
            placeholder="e.g. 2021"
            className={inputCls}
          />
        </Field>
        <Field label="To year (blank = still current)">
          <input
            name="yearTo"
            type="number"
            min={1950}
            max={2100}
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value)}
            placeholder="optional"
            className={inputCls}
          />
        </Field>
      </div>
      {yearHints.length > 0 && (
        <p className="-mt-2 text-xs text-zinc-400">
          Existing year ranges for {modelName.trim()}: {yearHints.join(", ")} —
          a matching range is reused automatically.
        </p>
      )}

      <fieldset>
        <legend className="text-sm font-medium">Igla product(s)</legend>
        <p className="text-xs text-zinc-400">
          Tick every product this one guide covers (e.g. 231 + Alarm).
        </p>
        <div className="mt-1 space-y-2 rounded-md border border-zinc-300 p-3">
          {taxonomy.productLines.map((pl) => (
            <div key={pl.id}>
              <div className="text-xs font-medium uppercase text-zinc-400">{pl.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {pl.products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="iglaProductIds"
                      value={p.id}
                      checked={productIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <Field label="Title">
        <input
          name="title"
          required
          className={inputCls}
          value={effectiveTitle}
          onChange={(e) => {
            setTitleTouched(true);
            setTitle(e.target.value);
          }}
          placeholder="Auto-filled"
        />
      </Field>

      <button
        type="submit"
        disabled={productIds.length === 0}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
      >
        Create draft guide
      </button>
    </form>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
