"use client";
// Identity layer editor — dropdown-only (AGENTS.md #1). Edits are STAGED: the
// fields change locally and NOTHING is written until you press "Save identity"
// (so an accidental dropdown change can't silently re-point a guide to another
// vehicle). Discard reverts to the saved identity. The guide title and all the
// content edits elsewhere stay instant — only the identity FKs are gated.
//
// To add a NEW make / model / generation (year frame) use the admin "Vehicle
// taxonomy" manager; this panel only re-points a guide onto existing options.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientDoc } from "./types";
import type { Taxonomy } from "@/lib/taxonomy";

type Draft = {
  makeId: string;
  altMakeIds: string[];
  modelId: string;
  generationId: string;
  trimId: string | null;
  regionId: string;
  productIds: string[];
  genName: string;
  genYearStart: number;
  genYearEnd: number | null;
};

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

function baseDraft(doc: ClientDoc): Draft {
  return {
    makeId: doc.makeId,
    altMakeIds: doc.altMakes?.map((a) => a.makeId) ?? [],
    modelId: doc.modelId,
    generationId: doc.generationId,
    trimId: doc.trimId ?? null,
    regionId: doc.regionId,
    productIds: doc.products?.length
      ? doc.products.map((p) => p.iglaProductId)
      : [doc.iglaProductId],
    genName: doc.generation.name,
    genYearStart: doc.generation.yearStart,
    genYearEnd: doc.generation.yearEnd ?? null,
  };
}

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
  const [draft, setDraft] = useState<Draft>(() => baseDraft(doc));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Re-sync to the document only when its SAVED identity actually changes (i.e.
  // after a successful save). Because we don't dispatch while editing, `doc`
  // stays put during editing, so this never clobbers an in-progress draft.
  const docSig = [
    doc.makeId,
    (doc.altMakes?.map((a) => a.makeId) ?? []).join(","),
    doc.modelId,
    doc.generationId,
    doc.trimId ?? "",
    doc.regionId,
    doc.generation.name,
    doc.generation.yearStart,
    doc.generation.yearEnd ?? "",
    doc.products?.length ? doc.products.map((p) => p.iglaProductId).join(",") : doc.iglaProductId,
  ].join("|");
  useEffect(() => {
    setDraft(baseDraft(doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docSig]);

  const make = taxonomy.makes.find((m) => m.id === draft.makeId);
  const model = make?.models.find((m) => m.id === draft.modelId);
  const generation = model?.generations.find((g) => g.id === draft.generationId);

  // Selecting a make/model resets the dependent fields to that branch's first
  // option; selecting a generation pulls its stored years into the editor.
  const pickMake = (makeId: string) => {
    const mk = taxonomy.makes.find((m) => m.id === makeId);
    const md = mk?.models[0];
    const g = md?.generations[0];
    setDraft((d) => ({
      ...d,
      makeId,
      altMakeIds: d.altMakeIds.filter((x) => x !== makeId), // can't bridge to its own make
      modelId: md?.id ?? "",
      generationId: g?.id ?? "",
      trimId: null,
      genName: g?.name ?? "",
      genYearStart: g?.yearStart ?? 0,
      genYearEnd: g?.yearEnd ?? null,
    }));
  };
  const pickModel = (modelId: string) => {
    const md = make?.models.find((m) => m.id === modelId);
    const g = md?.generations[0];
    setDraft((d) => ({
      ...d,
      modelId,
      generationId: g?.id ?? "",
      trimId: null,
      genName: g?.name ?? "",
      genYearStart: g?.yearStart ?? 0,
      genYearEnd: g?.yearEnd ?? null,
    }));
  };
  const pickGen = (generationId: string) => {
    const g = model?.generations.find((x) => x.id === generationId);
    setDraft((d) => ({
      ...d,
      generationId,
      trimId: null,
      genName: g?.name ?? "",
      genYearStart: g?.yearStart ?? 0,
      genYearEnd: g?.yearEnd ?? null,
    }));
  };

  const toggleProduct = (id: string) =>
    setDraft((d) => {
      const next = d.productIds.includes(id)
        ? d.productIds.filter((x) => x !== id)
        : [...d.productIds, id];
      return next.length === 0 ? d : { ...d, productIds: next }; // keep at least one
    });

  // Create a new model / generation inline. These CREATE taxonomy and re-point
  // this guide immediately (not staged), so they're gated behind saving any
  // other pending edits first. Adding a generation moves ONLY this guide onto
  // it — the way to split a duplicate off a shared generation.
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [showAddGen, setShowAddGen] = useState(false);
  const [newGen, setNewGen] = useState({ name: "", from: "", to: "" });

  const createModel = async () => {
    const name = newModel.trim();
    if (!name) return;
    setSaving(true);
    await dispatch([{ op: "create_model", name }]);
    setSaving(false);
    setNewModel("");
    setShowAddModel(false);
    router.refresh(); // refetch taxonomy so the new model shows in the dropdowns
  };
  const createGeneration = async () => {
    const name = newGen.name.trim();
    const ys = parseInt(newGen.from, 10);
    if (!name || Number.isNaN(ys)) return;
    const yeRaw = newGen.to.trim();
    const ye = yeRaw ? parseInt(yeRaw, 10) : null;
    setSaving(true);
    await dispatch([
      { op: "create_generation", name, yearStart: ys, yearEnd: ye !== null && Number.isNaN(ye) ? null : ye },
    ]);
    setSaving(false);
    setNewGen({ name: "", from: "", to: "" });
    setShowAddGen(false);
    router.refresh(); // refetch taxonomy so the new generation shows in the dropdown
  };

  // The guide title isn't identity — keep it instant (no Save gate).
  const setTitle = (title: string) =>
    void dispatch([{ op: "update_identity", data: { title } }]);

  const base = baseDraft(doc);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);

  const save = async () => {
    const ops: any[] = [];
    const idData: Record<string, string | null> = {};
    if (draft.makeId !== base.makeId) idData.makeId = draft.makeId;
    if (draft.modelId !== base.modelId) idData.modelId = draft.modelId;
    if (draft.generationId !== base.generationId) idData.generationId = draft.generationId;
    if ((draft.trimId ?? null) !== (base.trimId ?? null)) idData.trimId = draft.trimId ?? null;
    if (draft.regionId !== base.regionId) idData.regionId = draft.regionId;
    if (Object.keys(idData).length) ops.push({ op: "update_identity", data: idData });

    if (!sameIds(draft.productIds, base.productIds))
      ops.push({ op: "set_products", productIds: draft.productIds });

    if (!sameIds(draft.altMakeIds, base.altMakeIds))
      ops.push({ op: "set_alt_makes", makeIds: draft.altMakeIds });

    // Year/name edits apply to the (possibly newly) selected generation. Note
    // this renames the SHARED generation for every guide on it — by design.
    const selGen = taxonomy.makes
      .flatMap((m) => m.models)
      .flatMap((md) => md.generations)
      .find((g) => g.id === draft.generationId);
    if (selGen) {
      const gd: { name?: string; yearStart?: number; yearEnd?: number | null } = {};
      if (draft.genName.trim() && draft.genName.trim() !== selGen.name) gd.name = draft.genName.trim();
      if (draft.genYearStart !== selGen.yearStart) gd.yearStart = draft.genYearStart;
      if ((draft.genYearEnd ?? null) !== (selGen.yearEnd ?? null)) gd.yearEnd = draft.genYearEnd ?? null;
      if (Object.keys(gd).length) ops.push({ op: "update_generation", ...gd });
    }

    if (!ops.length) return;
    setSaving(true);
    await dispatch(ops);
    setSaving(false); // docSig changes → effect resets the draft to the saved state
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <input
            value={doc.title}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full truncate border-0 bg-transparent text-xl font-semibold focus:outline-none"
          />
          <p className="truncate text-xs text-zinc-500">
            {doc.make.name} {doc.model.name} {doc.generation.name}
            {doc.trim ? ` · ${doc.trim.name}` : ""} ·{" "}
            {doc.iglaProduct.productLine.name} {doc.iglaProduct.name} · {doc.region.name}
          </p>
        </div>
        {dirty && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            unsaved
          </span>
        )}
        <span className="text-sm text-zinc-400">{open ? "▲" : "▼ identity"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-100 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Make"
              value={draft.makeId}
              onChange={pickMake}
              options={taxonomy.makes.map((m) => ({ value: m.id, label: m.name }))}
            />
            {/* Secondary make(s): same vehicle is found under another make name
                (RAM↔Dodge). Per-guide bridge — only THIS guide is matched. */}
            <div className="sm:col-span-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <span className="text-xs font-medium text-zinc-500">
                Also matches make(s){" "}
                <span className="font-normal text-zinc-400">— secondary / former name</span>
              </span>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {draft.altMakeIds.map((id) => {
                  const m = taxonomy.makes.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-zinc-300"
                    >
                      {m?.name ?? "—"}
                      <button
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            altMakeIds: d.altMakeIds.filter((x) => x !== id),
                          }))
                        }
                        className="text-zinc-400 hover:text-zinc-700"
                        aria-label={`Remove ${m?.name ?? "make"}`}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setDraft((d) => ({ ...d, altMakeIds: [...d.altMakeIds, v] }));
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                >
                  <option value="">+ add make…</option>
                  {taxonomy.makes
                    .filter((m) => m.id !== draft.makeId && !draft.altMakeIds.includes(m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                e.g. add “Dodge” to a RAM guide so the same truck is found under either
                name. Only this guide is bridged — pick from existing makes (add a new
                make in the admin Vehicle taxonomy first if it’s missing).
              </p>
            </div>
            <div>
              <Select
                label="Model"
                value={draft.modelId}
                onChange={pickModel}
                options={(make?.models ?? []).map((m) => ({ value: m.id, label: m.name }))}
              />
              {showAddModel ? (
                <div className="mt-1 flex items-center gap-1">
                  <input
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    placeholder="New model name"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => void createModel()}
                    disabled={dirty || saving || !newModel.trim()}
                    className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowAddModel(false);
                      setNewModel("");
                    }}
                    className="px-1 text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddModel(true)}
                  className="mt-1 text-xs text-zinc-500 hover:text-zinc-800"
                >
                  + New model
                </button>
              )}
              {dirty && showAddModel && (
                <p className="mt-0.5 text-[11px] text-amber-600">Save or discard your changes first.</p>
              )}
            </div>
            <Select
              label="Generation"
              value={draft.generationId}
              onChange={pickGen}
              options={(model?.generations ?? []).map((g) => {
                const cur = g.id === draft.generationId;
                const name = cur ? draft.genName : g.name;
                const ys = cur ? draft.genYearStart : g.yearStart;
                const ye = cur ? draft.genYearEnd : g.yearEnd;
                return { value: g.id, label: `${name} (${ys}–${ye ?? "now"})` };
              })}
            />
            {/* Quick-edit the selected generation's real years (staged). To add
                a brand-new year frame, use the admin Vehicle taxonomy manager. */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-xs font-medium text-zinc-500">Generation years</span>
                <span className="text-xs text-zinc-400">which model-years the Igla app matches</span>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col text-xs text-zinc-500">
                  Label
                  <input
                    value={draft.genName}
                    onChange={(e) => setDraft((d) => ({ ...d, genName: e.target.value }))}
                    className="mt-1 w-40 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col text-xs text-zinc-500">
                  From
                  <input
                    type="number"
                    value={draft.genYearStart || ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, genYearStart: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="mt-1 w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col text-xs text-zinc-500">
                  To (blank = now)
                  <input
                    type="number"
                    value={draft.genYearEnd ?? ""}
                    placeholder="now"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setDraft((d) => ({ ...d, genYearEnd: raw ? parseInt(raw, 10) || null : null }));
                    }}
                    className="mt-1 w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <p className="mt-1.5 text-xs text-zinc-400">
                Renaming or re-yearing applies to every guide on the {doc.model.name}{" "}
                “{generation?.name ?? draft.genName}” generation.
              </p>

              {/* Split this guide onto its OWN generation (e.g. after duplicating
                  a guide) so its years are independent of the shared one. */}
              <div className="mt-2 border-t border-zinc-200 pt-2">
                {showAddGen ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col text-[11px] text-zinc-500">
                      New generation
                      <input
                        value={newGen.name}
                        onChange={(e) => setNewGen((g) => ({ ...g, name: e.target.value }))}
                        placeholder="e.g. 2026+"
                        className="mt-0.5 w-40 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="flex flex-col text-[11px] text-zinc-500">
                      From
                      <input
                        type="number"
                        value={newGen.from}
                        onChange={(e) => setNewGen((g) => ({ ...g, from: e.target.value }))}
                        placeholder="2026"
                        className="mt-0.5 w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="flex flex-col text-[11px] text-zinc-500">
                      To
                      <input
                        type="number"
                        value={newGen.to}
                        onChange={(e) => setNewGen((g) => ({ ...g, to: e.target.value }))}
                        placeholder="now"
                        className="mt-0.5 w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      onClick={() => void createGeneration()}
                      disabled={dirty || saving || !newGen.name.trim() || !newGen.from.trim()}
                      className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
                    >
                      Add &amp; move
                    </button>
                    <button
                      onClick={() => setShowAddGen(false)}
                      className="px-1 text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddGen(true)}
                    className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                  >
                    + New generation — put just this guide on its own years
                  </button>
                )}
                {dirty && showAddGen && (
                  <p className="mt-0.5 text-[11px] text-amber-600">Save or discard your changes first.</p>
                )}
              </div>
            </div>
            <Select
              label="Trim (optional)"
              value={draft.trimId ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, trimId: v || null }))}
              options={[
                { value: "", label: "Whole generation" },
                ...(generation?.trims ?? []).map((t) => ({ value: t.id, label: t.name })),
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
                            checked={draft.productIds.includes(p.id)}
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
              value={draft.regionId}
              onChange={(v) => setDraft((d) => ({ ...d, regionId: v }))}
              options={taxonomy.regions.map((r) => ({ value: r.id, label: r.name }))}
            />
          </div>

          {/* Save bar — identity is only written when you commit it here. */}
          <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
            <button
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save identity"}
            </button>
            <button
              onClick={() => setDraft(baseDraft(doc))}
              disabled={!dirty || saving}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40"
            >
              Discard
            </button>
            <span className="text-xs text-zinc-400">
              {dirty
                ? "Pending identity changes aren’t live until you save."
                : "These fields drive the Igla app’s automatic guide lookup."}
            </span>
          </div>
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
