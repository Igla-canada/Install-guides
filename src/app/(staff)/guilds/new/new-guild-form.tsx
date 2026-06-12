"use client";

import { useMemo, useState } from "react";
import type { Taxonomy } from "@/lib/taxonomy";

export default function NewGuildForm({
  taxonomy,
  action,
}: {
  taxonomy: Taxonomy;
  action: (formData: FormData) => Promise<void>;
}) {
  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [trimId, setTrimId] = useState("");
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const make = taxonomy.makes.find((m) => m.id === makeId);
  const model = make?.models.find((m) => m.id === modelId);
  const generation = model?.generations.find((g) => g.id === generationId);

  // Auto-suggest a title like "BMW 4 Series II (G22) — IGLA Alarm".
  const suggestedTitle = useMemo(() => {
    if (!make || !model || !generation) return "";
    const product = taxonomy.productLines
      .flatMap((pl) => pl.products.map((p) => ({ ...p, line: pl.name })))
      .find((p) => p.id === productId);
    const trim = generation.trims.find((t) => t.id === trimId);
    return [
      make.name,
      model.name,
      generation.name,
      trim ? `(${trim.name})` : "",
      product ? `— ${product.name}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }, [make, model, generation, trimId, productId, taxonomy.productLines]);

  const effectiveTitle = titleTouched ? title : suggestedTitle;

  return (
    <form action={action} className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
      <Field label="Region">
        <select name="regionId" required className={selectCls} defaultValue={taxonomy.regions[0]?.id}>
          {taxonomy.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Make">
        <select
          name="makeId"
          required
          className={selectCls}
          value={makeId}
          onChange={(e) => {
            setMakeId(e.target.value);
            setModelId("");
            setGenerationId("");
            setTrimId("");
          }}
        >
          <option value="">Select make…</option>
          {taxonomy.makes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Model">
        <select
          name="modelId"
          required
          disabled={!make}
          className={selectCls}
          value={modelId}
          onChange={(e) => {
            setModelId(e.target.value);
            setGenerationId("");
            setTrimId("");
          }}
        >
          <option value="">Select model…</option>
          {make?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Generation">
        <select
          name="generationId"
          required
          disabled={!model}
          className={selectCls}
          value={generationId}
          onChange={(e) => {
            setGenerationId(e.target.value);
            setTrimId("");
          }}
        >
          <option value="">Select generation…</option>
          {model?.generations.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.yearStart}–{g.yearEnd ?? "now"})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Trim / engine (optional — only if wiring differs per trim)">
        <select
          name="trimId"
          disabled={!generation}
          className={selectCls}
          value={trimId}
          onChange={(e) => setTrimId(e.target.value)}
        >
          <option value="">Whole generation</option>
          {generation?.trims.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Igla product">
        <select
          name="iglaProductId"
          required
          className={selectCls}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">Select product…</option>
          {taxonomy.productLines.map((pl) => (
            <optgroup key={pl.id} label={pl.name}>
              {pl.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="Title">
        <input
          name="title"
          required
          className={selectCls}
          value={effectiveTitle}
          onChange={(e) => {
            setTitleTouched(true);
            setTitle(e.target.value);
          }}
          placeholder="Auto-filled from identity"
        />
      </Field>

      <button
        type="submit"
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Create draft guild
      </button>
    </form>
  );
}

const selectCls =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
