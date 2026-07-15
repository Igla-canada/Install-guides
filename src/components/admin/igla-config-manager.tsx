"use client";
// Admin → Igla settings. Manages the master settings template for each product
// (unit type): sections, rows, control types, dropdown option lists, default
// values and their ORDER — mirroring the official Igla configuration software so
// a guide's settings section can be copied exactly. Frozen-snapshot semantics:
// editing here never touches guides that already embedded the template.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import {
  CONTROL_TYPES,
  blankControl,
  emptyDoc,
  type IglaConfigDoc,
  type IglaControlType,
  type IglaOption,
  type IglaRow,
  type IglaSection,
} from "@/lib/igla-config";
import { IGLA_FD_DEFAULT } from "@/lib/igla-fd-default";

type ProductLite = {
  id: string;
  name: string;
  line: string;
  hasTemplate: boolean;
  sectionCount: number;
};

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id${Math.round(performance.now() * 1000)}`;

// Move item at index i by dir (-1 up / +1 down), returns a new array.
function move<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export default function IglaConfigManager() {
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [doc, setDoc] = useState<IglaConfigDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadProducts = async () => {
    const r = await fetch("/api/igla-config/products");
    if (r.ok) setProducts((await r.json()).products);
  };
  useEffect(() => {
    void loadProducts();
  }, []);

  const selectProduct = async (id: string) => {
    setSelected(id);
    setDoc(null);
    setMsg(null);
    const r = await fetch(`/api/igla-config/${id}`);
    if (r.ok) {
      const data = await r.json();
      setProductName(data.productName);
      setDoc(data.doc);
      setDirty(false);
    }
  };

  const save = async () => {
    if (!selected || !doc) return;
    setSaving(true);
    setMsg(null);
    const r = await fetch(`/api/igla-config/${selected}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc }),
    });
    setSaving(false);
    if (r.ok) {
      setDirty(false);
      setMsg("Saved.");
      void loadProducts();
    } else {
      setMsg("Save failed.");
    }
  };

  // ---- doc mutation helpers (all immutable + mark dirty) ----
  const edit = (fn: (d: IglaConfigDoc) => IglaConfigDoc) => {
    setDoc((d) => (d ? fn(structuredClone(d)) : d));
    setDirty(true);
  };
  const editSections = (fn: (s: IglaSection[]) => IglaSection[]) =>
    edit((d) => ({ ...d, sections: fn(d.sections) }));
  const editSection = (si: number, fn: (s: IglaSection) => IglaSection) =>
    editSections((secs) => secs.map((s, i) => (i === si ? fn(s) : s)));
  const editRow = (si: number, ri: number, fn: (r: IglaRow) => IglaRow) =>
    editSection(si, (s) => ({ ...s, rows: s.rows.map((r, i) => (i === ri ? fn(r) : r)) }));

  const addSection = () =>
    editSections((secs) => [...secs, { id: uid(), title: "New section", rows: [] }]);
  const addRow = (si: number) =>
    editSection(si, (s) => ({
      ...s,
      rows: [...s.rows, { id: uid(), label: "New setting", control: blankControl("toggle") }],
    }));

  const deleteTemplate = async (p: ProductLite) => {
    if (
      !confirm(
        `Clear the settings template for "${p.name}"?\n\nThis removes the template — the unit type goes back to empty. Guides already built keep their own frozen copy. This cannot be undone.`
      )
    )
      return;
    const r = await fetch(`/api/igla-config/${p.id}`, { method: "DELETE" });
    if (!r.ok) return;
    // If we were editing this one, drop back to an empty editor.
    if (selected === p.id) {
      setDoc(emptyDoc());
      setDirty(false);
      setMsg("Template cleared.");
    }
    await loadProducts();
  };

  const loadFdDefaults = () => {
    if (
      doc &&
      doc.sections.length > 0 &&
      !confirm("Replace the current template with the IGLA FD defaults? This overwrites what's here (guides already built are untouched).")
    )
      return;
    setDoc(structuredClone(IGLA_FD_DEFAULT));
    setDirty(true);
    setMsg("Loaded IGLA FD defaults — review and Save.");
  };

  return (
    <div className="mt-6 flex flex-col gap-4 lg:flex-row">
      {/* Product (unit type) list */}
      <div className="lg:w-64 lg:shrink-0">
        <h2 className="text-sm font-semibold">Unit type</h2>
        <p className="mt-1 text-xs text-zinc-400">
          One settings template per product. Pick one to edit its sections and
          dropdowns.
        </p>
        <ul className="mt-3 space-y-1">
          {products.map((p) => (
            <li key={p.id} className="relative">
              <button
                onClick={() => void selectProduct(p.id)}
                className={`flex w-full items-center rounded-md border px-3 py-2 pr-20 text-left text-sm ${
                  selected === p.id
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <span className="min-w-0">
                  {p.name}
                  <span
                    className={`block text-xs ${
                      selected === p.id ? "text-zinc-300" : "text-zinc-400"
                    }`}
                  >
                    {p.line}
                  </span>
                </span>
              </button>
              {/* Status pill + clear-template button. The cluster ignores
                  pointer events so clicking anywhere else still selects the row;
                  only the trash button re-enables them. */}
              <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    p.hasTemplate ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {p.hasTemplate ? `${p.sectionCount} sect.` : "empty"}
                </span>
                {p.hasTemplate && (
                  <button
                    onClick={() => void deleteTemplate(p)}
                    className="pointer-events-auto rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                    title={`Clear the ${p.name} template`}
                  >
                    🗑
                  </button>
                )}
              </div>
            </li>
          ))}
          {products.length === 0 && (
            <li className="text-xs text-zinc-400">
              No products yet — add them in the Products tab.
            </li>
          )}
        </ul>
      </div>

      {/* Editor */}
      <div className="min-w-0 flex-1">
        {!selected ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400">
            Select a unit type to edit its settings template.
          </p>
        ) : !doc ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <>
            <div className="sticky top-12 z-20 -mx-1 mb-3 flex flex-wrap items-center gap-2 bg-zinc-50/95 px-1 py-2 backdrop-blur">
              <h2 className="text-sm font-semibold">{productName} — settings template</h2>
              {dirty && <span className="text-xs text-amber-600">● unsaved</span>}
              {msg && <span className="text-xs text-zinc-500">{msg}</span>}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={loadFdDefaults}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                  title="Fill this template with the transcribed IGLA FD screenshots"
                >
                  Load IGLA FD defaults
                </button>
                <button
                  onClick={() => void save()}
                  disabled={saving || !dirty}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save template"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {doc.sections.map((section, si) => (
                <div key={section.id} className="rounded-xl border border-zinc-200 bg-white">
                  <div className="flex items-center gap-2 rounded-t-xl border-b border-zinc-100 bg-zinc-50 px-3 py-2">
                    <input
                      value={section.title}
                      onChange={(e) =>
                        editSection(si, (s) => ({ ...s, title: e.target.value }))
                      }
                      className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium"
                    />
                    <button onClick={() => editSections((s) => move(s, si, -1))} className="px-1 text-zinc-400 hover:text-zinc-700" title="Move up">↑</button>
                    <button onClick={() => editSections((s) => move(s, si, 1))} className="px-1 text-zinc-400 hover:text-zinc-700" title="Move down">↓</button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete section "${section.title}" and its ${section.rows.length} row(s)?`))
                          editSections((s) => s.filter((_, i) => i !== si));
                      }}
                      className="px-1 text-red-400 hover:text-red-600"
                      title="Delete section"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {section.rows.map((row, ri) => (
                      <RowEditor
                        key={row.id}
                        row={row}
                        onChange={(fn) => editRow(si, ri, fn)}
                        onMove={(dir) => editSection(si, (s) => ({ ...s, rows: move(s.rows, ri, dir) }))}
                        onDelete={() =>
                          editSection(si, (s) => ({ ...s, rows: s.rows.filter((_, i) => i !== ri) }))
                        }
                      />
                    ))}
                  </div>
                  <div className="px-3 py-2">
                    <button
                      onClick={() => addRow(si)}
                      className="rounded-md border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
                    >
                      + Add setting
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addSection}
              className="mt-3 w-full rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
            >
              + Add section
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row + control-specific editors
// ---------------------------------------------------------------------------

function RowEditor({
  row,
  onChange,
  onMove,
  onDelete,
}: {
  row: IglaRow;
  onChange: (fn: (r: IglaRow) => IglaRow) => void;
  onMove: (dir: number) => void;
  onDelete: () => void;
}) {
  const setControlType = (type: IglaControlType) =>
    onChange((r) => ({ ...r, control: blankControl(type) }));

  return (
    <div className="px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <input
            value={row.label}
            onChange={(e) => onChange((r) => ({ ...r, label: e.target.value }))}
            placeholder="Setting label"
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
          />
          <input
            value={row.help ?? ""}
            onChange={(e) => onChange((r) => ({ ...r, help: e.target.value || undefined }))}
            placeholder='Help text (the "?" tooltip) — optional'
            className="w-full rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-500"
          />
        </div>
        <select
          value={row.control.type}
          onChange={(e) => setControlType(e.target.value as IglaControlType)}
          className="rounded-md border border-zinc-300 px-1 py-1 text-xs"
          title="Control type"
        >
          {CONTROL_TYPES.map((c) => (
            <option key={c.type} value={c.type}>
              {c.label}
            </option>
          ))}
        </select>
        <button onClick={() => onMove(-1)} className="px-1 text-zinc-400 hover:text-zinc-700" title="Move up">↑</button>
        <button onClick={() => onMove(1)} className="px-1 text-zinc-400 hover:text-zinc-700" title="Move down">↓</button>
        <button onClick={onDelete} className="px-1 text-red-400 hover:text-red-600" title="Delete setting">✕</button>
      </div>
      <div className="mt-2 rounded-md bg-zinc-50 p-2">
        <ControlEditor row={row} onChange={onChange} />
      </div>
    </div>
  );
}

function ControlEditor({
  row,
  onChange,
}: {
  row: IglaRow;
  onChange: (fn: (r: IglaRow) => IglaRow) => void;
}) {
  const c = row.control;
  const setC = (patch: any) =>
    onChange((r) => ({ ...r, control: { ...r.control, ...patch } as any }));

  if (c.type === "toggle") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          value={c.onLabel ?? ""}
          onChange={(e) => setC({ onLabel: e.target.value })}
          placeholder="On label"
          className="w-28 rounded border border-zinc-300 px-1.5 py-0.5"
        />
        <input
          value={c.offLabel ?? ""}
          onChange={(e) => setC({ offLabel: e.target.value })}
          placeholder="Off label"
          className="w-28 rounded border border-zinc-300 px-1.5 py-0.5"
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={c.value} onChange={(e) => setC({ value: e.target.checked })} />
          Default on
        </label>
      </div>
    );
  }

  if (c.type === "slider") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          Min
          <input type="number" value={c.min} onChange={(e) => setC({ min: Number(e.target.value) })} className="w-16 rounded border border-zinc-300 px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1">
          Max
          <input type="number" value={c.max} onChange={(e) => setC({ max: Number(e.target.value) })} className="w-16 rounded border border-zinc-300 px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1">
          Default
          <input type="number" value={c.value} onChange={(e) => setC({ value: Number(e.target.value) })} className="w-16 rounded border border-zinc-300 px-1 py-0.5" />
        </label>
      </div>
    );
  }

  if (c.type === "number") {
    return (
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">Boxes:</span>
          <input
            value={c.unit ?? ""}
            onChange={(e) => setC({ unit: e.target.value || undefined })}
            placeholder="Unit (e.g. HH:MM)"
            className="w-28 rounded border border-zinc-300 px-1.5 py-0.5"
          />
        </div>
        {c.segments.map((seg, i) => (
          <div key={seg.id} className="flex items-center gap-1">
            <input
              value={seg.label ?? ""}
              onChange={(e) =>
                setC({ segments: c.segments.map((s, j) => (j === i ? { ...s, label: e.target.value || undefined } : s)) })
              }
              placeholder="label"
              className="w-16 rounded border border-zinc-300 px-1 py-0.5"
            />
            <input
              value={seg.value}
              onChange={(e) =>
                setC({ segments: c.segments.map((s, j) => (j === i ? { ...s, value: e.target.value } : s)) })
              }
              placeholder="default"
              className="w-16 rounded border border-zinc-300 px-1 py-0.5"
            />
            <input
              type="number"
              value={seg.max ?? ""}
              onChange={(e) =>
                setC({ segments: c.segments.map((s, j) => (j === i ? { ...s, max: e.target.value ? Number(e.target.value) : undefined } : s)) })
              }
              placeholder="max"
              className="w-14 rounded border border-zinc-300 px-1 py-0.5"
            />
            <button
              onClick={() => setC({ segments: c.segments.filter((_, j) => j !== i) })}
              className="px-1 text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setC({ segments: [...c.segments, { id: uid(), value: "0" }] })}
          className="rounded border border-dashed border-zinc-300 px-1.5 py-0.5 text-zinc-500 hover:text-zinc-700"
        >
          + box
        </button>
      </div>
    );
  }

  if (c.type === "select") {
    return (
      <OptionList
        options={c.options}
        value={c.value}
        onOptions={(options, value) => setC({ options, value })}
        onValue={(value) => setC({ value })}
      />
    );
  }

  // io
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          Colour
          <input type="color" value={c.color} onChange={(e) => setC({ color: e.target.value })} className="h-6 w-8 rounded border border-zinc-300" />
        </label>
        <input
          value={c.wire}
          onChange={(e) => setC({ wire: e.target.value })}
          placeholder="Wire name (e.g. White-blue)"
          className="w-40 rounded border border-zinc-300 px-1.5 py-0.5"
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={c.inversion} onChange={(e) => setC({ inversion: e.target.checked })} />
          Signal inversion default on
        </label>
      </div>
      <div className="rounded border border-zinc-200 bg-white p-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-500">Direction</span>
          <label className="flex items-center gap-1 text-[11px] text-zinc-500">
            <input
              type="checkbox"
              checked={Boolean(c.direction.locked)}
              onChange={(e) => setC({ direction: { ...c.direction, locked: e.target.checked } })}
            />
            locked (read-only in guide)
          </label>
        </div>
        <OptionList
          options={c.direction.options}
          value={c.direction.value}
          onOptions={(options, value) => setC({ direction: { ...c.direction, options, value } })}
          onValue={(value) => setC({ direction: { ...c.direction, value } })}
        />
      </div>
      <div className="rounded border border-zinc-200 bg-white p-1.5">
        <span className="font-medium text-zinc-500">Function</span>
        <OptionList
          options={c.func.options}
          value={c.func.value}
          onOptions={(options, value) => setC({ func: { ...c.func, options, value } })}
          onValue={(value) => setC({ func: { ...c.func, value } })}
        />
      </div>
    </div>
  );
}

// Shared option-list editor for select / io-direction / io-function. Lets the
// admin add/remove/reorder/rename options and mark one as the default (●).
function OptionList({
  options,
  value,
  onOptions,
  onValue,
}: {
  options: IglaOption[];
  value: string | null;
  onOptions: (options: IglaOption[], value: string | null) => void;
  onValue: (value: string | null) => void;
}) {
  const setLabel = (i: number, label: string) =>
    onOptions(
      options.map((o, j) => (j === i ? { ...o, label } : o)),
      value
    );
  const removeAt = (i: number) => {
    const removed = options[i];
    const next = options.filter((_, j) => j !== i);
    onOptions(next, value === removed.id ? next[0]?.id ?? null : value);
  };
  const moveAt = (i: number, dir: number) => onOptions(move(options, i, dir), value);
  const add = () => {
    const o = { id: uid(), label: "New option" };
    onOptions([...options, o], value ?? o.id);
  };

  return (
    <div className="mt-1 space-y-1">
      {options.map((o, i) => (
        <div key={o.id} className="flex items-center gap-1">
          <button
            onClick={() => onValue(o.id)}
            title="Set as default"
            className={`h-4 w-4 shrink-0 rounded-full border text-[9px] ${
              value === o.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"
            }`}
          >
            {value === o.id ? "●" : ""}
          </button>
          <input
            value={o.label}
            onChange={(e) => setLabel(i, e.target.value)}
            className="min-w-0 flex-1 rounded border border-zinc-300 px-1.5 py-0.5"
          />
          <button onClick={() => moveAt(i, -1)} className="px-1 text-zinc-400 hover:text-zinc-700">↑</button>
          <button onClick={() => moveAt(i, 1)} className="px-1 text-zinc-400 hover:text-zinc-700">↓</button>
          <button onClick={() => removeAt(i)} className="px-1 text-red-400 hover:text-red-600">✕</button>
        </div>
      ))}
      <button
        onClick={add}
        className="rounded border border-dashed border-zinc-300 px-1.5 py-0.5 text-zinc-500 hover:text-zinc-700"
      >
        + option
      </button>
    </div>
  );
}
