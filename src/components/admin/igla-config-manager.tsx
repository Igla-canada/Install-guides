"use client";
// Admin → Igla settings. Manages the master settings template for each product
// (unit type): sections, rows, control types, dropdown option lists, default
// values and their ORDER — mirroring the official Igla configuration software so
// a guide's settings section can be copied exactly. Frozen-snapshot semantics:
// editing here never touches guides that already embedded the template.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  CONTROL_TYPES,
  blankControl,
  cloneDoc,
  cloneRow,
  cloneSection,
  blankExtraOptionsFlags,
  blankExtraOptionsToggle,
  coerceToFlagsControl,
  emptyDoc,
  isCarConfigurationRow,
  isExtraOptionsRow,
  reorder,
  type IglaConfigDoc,
  type IglaControlType,
  type IglaOption,
  type IglaRow,
  type IglaSection,
} from "@/lib/igla-config";
import { IGLA_FD_DEFAULT } from "@/lib/igla-fd-default";
import { IGLA_ALARM_DEFAULT } from "@/lib/igla-alarm-default";
import { IGLA_231_DEFAULT } from "@/lib/igla-231-default";
import { IGLA_OLD_DEFAULT } from "@/lib/igla-old-default";
import { IGLA_ALARM_OLD_DEFAULT } from "@/lib/igla-alarm-old-default";
import {
  is231Product,
  isAlarmProduct,
  type FlasherVariant,
} from "@/lib/igla-flasher-packs";
import { templateVariantLabel } from "@/lib/igla-template-variant";

type ProductLite = {
  id: string;
  name: string;
  line: string;
  supportsOldFlasher: boolean;
  hasTemplate: boolean;
  sectionCount: number;
  hasOldTemplate: boolean;
  oldSectionCount: number;
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
  const [variant, setVariant] = useState<FlasherVariant>("current");
  const [productName, setProductName] = useState("");
  const [doc, setDoc] = useState<IglaConfigDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copyToId, setCopyToId] = useState("");

  const sectionDrag = useRef<number | null>(null);
  const [sectionOver, setSectionOver] = useState<number | null>(null);
  /** Index of section currently being dragged (for outline highlight). */
  const [sectionDragging, setSectionDragging] = useState<number | null>(null);
  const rowDrag = useRef<{ si: number; ri: number } | null>(null);
  const [rowOver, setRowOver] = useState<{ si: number; ri: number } | null>(null);
  const [rowDragging, setRowDragging] = useState<{ si: number; ri: number } | null>(
    null,
  );

  const clearSectionDrag = () => {
    sectionDrag.current = null;
    setSectionOver(null);
    setSectionDragging(null);
  };
  const clearRowDrag = () => {
    rowDrag.current = null;
    setRowOver(null);
    setRowDragging(null);
  };

  const scrollToSection = (sectionId: string) => {
    document
      .getElementById(`igla-section-${sectionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const loadProducts = async () => {
    const r = await fetch("/api/igla-config/products");
    if (r.ok) setProducts((await r.json()).products);
  };
  useEffect(() => {
    void loadProducts();
  }, []);

  const selectProduct = async (
    id: string,
    nextVariant: FlasherVariant = "current",
  ) => {
    setSelected(id);
    setVariant(nextVariant);
    setDoc(null);
    setMsg(null);
    setCopyToId("");
    const r = await fetch(
      `/api/igla-config/${id}?variant=${encodeURIComponent(nextVariant)}`,
    );
    if (r.ok) {
      const data = await r.json();
      setProductName(data.productName);
      setVariant(data.variant === "old" ? "old" : "current");
      setDoc(data.doc);
      setDirty(false);
      void loadProducts();
    }
  };

  const save = async () => {
    if (!selected || !doc) return;
    setSaving(true);
    setMsg(null);
    const r = await fetch(
      `/api/igla-config/${selected}?variant=${encodeURIComponent(variant)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
      },
    );
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

  const duplicateSection = (si: number) =>
    editSections((secs) => {
      const copy = cloneSection(secs[si]);
      const next = [...secs];
      next.splice(si + 1, 0, copy);
      return next;
    });

  const duplicateRow = (si: number, ri: number) =>
    editSection(si, (s) => {
      const copy = cloneRow(s.rows[ri]);
      const rows = [...s.rows];
      rows.splice(ri + 1, 0, copy);
      return { ...s, rows };
    });

  /** Copy this whole template onto another unit type's current flasher (fresh ids). */
  const copyTemplateTo = async () => {
    if (!doc || !copyToId || copyToId === selected) return;
    const target = products.find((p) => p.id === copyToId);
    if (!target) return;
    if (
      target.hasTemplate &&
      !confirm(
        `Replace the current-flasher template on “${target.name}” with a copy of “${productName}” (${templateVariantLabel(variant)})?\n\nGuides already built keep their own frozen copy.`,
      )
    ) {
      return;
    }
    const next = cloneDoc(doc);
    delete next.productId;
    delete next.productName;
    setSaving(true);
    setMsg(null);
    const r = await fetch(`/api/igla-config/${copyToId}?variant=current`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: next }),
    });
    setSaving(false);
    if (r.ok) {
      setMsg(`Copied template to ${target.name} (current flasher).`);
      setCopyToId("");
      void loadProducts();
    } else {
      setMsg("Copy failed.");
    }
  };

  const deleteTemplate = async (
    p: ProductLite,
    clearVariant: FlasherVariant = "current",
  ) => {
    const label = templateVariantLabel(clearVariant);
    if (
      !confirm(
        `Clear the ${label.toLowerCase()} settings template for "${p.name}"?\n\nGuides already built keep their own frozen copy. This cannot be undone.`,
      )
    )
      return;
    const r = await fetch(
      `/api/igla-config/${p.id}?variant=${encodeURIComponent(clearVariant)}`,
      { method: "DELETE" },
    );
    if (!r.ok) return;
    if (selected === p.id && variant === clearVariant) {
      setDoc(emptyDoc());
      setDirty(false);
      setMsg(`${label} template cleared.`);
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

  const loadAlarmDefaults = () => {
    if (
      doc &&
      doc.sections.length > 0 &&
      !confirm(
        "Replace the current template with the IGLA Alarm defaults? This overwrites what's here (guides already built are untouched).",
      )
    )
      return;
    setDoc(structuredClone(IGLA_ALARM_DEFAULT));
    setDirty(true);
    setMsg("Loaded IGLA Alarm defaults — review and Save.");
  };

  const load231Defaults = () => {
    if (
      doc &&
      doc.sections.length > 0 &&
      !confirm(
        "Replace the current template with the IGLA 231 defaults? This overwrites what's here (guides already built are untouched).",
      )
    )
      return;
    setDoc(structuredClone(IGLA_231_DEFAULT));
    setDirty(true);
    setMsg("Loaded IGLA 231 defaults — review and Save.");
  };

  const loadOldDefaults = () => {
    if (
      doc &&
      doc.sections.length > 0 &&
      !confirm(
        "Replace this template with the older 231 flasher pack? (Not a separate product — intended for the IGLA 231 unit type. Guides already built are untouched.)",
      )
    )
      return;
    setDoc(structuredClone(IGLA_OLD_DEFAULT));
    setDirty(true);
    setMsg("Loaded old 231 flasher pack — review and Save.");
  };

  const loadAlarmOldDefaults = () => {
    if (
      doc &&
      doc.sections.length > 0 &&
      !confirm(
        "Replace this template with the older Alarm flasher pack? (Not a separate product — intended for the IGLA Alarm unit type. Guides already built are untouched.)",
      )
    )
      return;
    setDoc(structuredClone(IGLA_ALARM_OLD_DEFAULT));
    setDirty(true);
    setMsg("Loaded old Alarm flasher pack — review and Save.");
  };

  const otherProducts = products.filter((p) => p.id !== selected);

  return (
    <div className="mt-6 flex flex-col gap-4 lg:flex-row">
      {/* Product (unit type) list — 231/Alarm also expose Old flasher under the same product */}
      <div className="lg:w-72 lg:shrink-0">
        <h2 className="text-sm font-semibold">Unit type</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Edit the settings template for each product. IGLA 231 and Alarm also
          have an Old flasher layout (same product, older software).
        </p>
        <ul className="mt-3 space-y-2">
          {products.map((p) => {
            const currentSelected =
              selected === p.id && variant === "current";
            const oldSelected = selected === p.id && variant === "old";
            return (
              <li key={p.id} className="space-y-1">
                <div className="relative">
                  <button
                    onClick={() => void selectProduct(p.id, "current")}
                    className={`flex w-full items-center rounded-md border px-3 py-2 pr-20 text-left text-sm ${
                      currentSelected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    <span className="min-w-0">
                      {p.name}
                      <span
                        className={`block text-xs ${
                          currentSelected ? "text-zinc-300" : "text-zinc-400"
                        }`}
                      >
                        {p.supportsOldFlasher
                          ? `${p.line} · Current flasher`
                          : p.line}
                      </span>
                    </span>
                  </button>
                  <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        p.hasTemplate
                          ? "bg-green-100 text-green-800"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {p.hasTemplate ? `${p.sectionCount} sect.` : "empty"}
                    </span>
                    {p.hasTemplate && (
                      <button
                        onClick={() => void deleteTemplate(p, "current")}
                        className="pointer-events-auto rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                        title={`Clear current-flasher template for ${p.name}`}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
                {p.supportsOldFlasher && (
                  <div className="relative pl-3">
                    <button
                      onClick={() => void selectProduct(p.id, "old")}
                      className={`flex w-full items-center rounded-md border px-3 py-2 pr-20 text-left text-sm ${
                        oldSelected
                          ? "border-amber-800 bg-amber-900 text-white"
                          : "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
                      }`}
                    >
                      <span className="min-w-0">
                        Old flasher
                        <span
                          className={`block text-xs ${
                            oldSelected ? "text-amber-100" : "text-amber-700/70"
                          }`}
                        >
                          Same product · older software layout
                        </span>
                      </span>
                    </button>
                    <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          p.hasOldTemplate
                            ? "bg-amber-100 text-amber-900"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {p.hasOldTemplate
                          ? `${p.oldSectionCount} sect.`
                          : "empty"}
                      </span>
                      {p.hasOldTemplate && (
                        <button
                          onClick={() => void deleteTemplate(p, "old")}
                          className="pointer-events-auto rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                          title={`Clear old-flasher template for ${p.name}`}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
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
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1">
            <div className="sticky top-12 z-20 -mx-1 mb-3 flex flex-wrap items-center gap-2 bg-zinc-50/95 px-1 py-2 backdrop-blur">
              <h2 className="text-sm font-semibold">
                {productName}
                {variant === "old" ? " · Old flasher" : ""} — settings template
              </h2>
              {dirty && <span className="text-xs text-amber-600">● unsaved</span>}
              {msg && <span className="text-xs text-zinc-500">{msg}</span>}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {otherProducts.length > 0 && variant === "current" && (
                  <div className="flex items-center gap-1">
                    <select
                      value={copyToId}
                      onChange={(e) => setCopyToId(e.target.value)}
                      className="max-w-[10rem] rounded-md border border-zinc-300 px-1.5 py-1 text-xs"
                      title="Copy this full template onto another unit type"
                    >
                      <option value="">Clone full template to…</option>
                      {otherProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.hasTemplate ? " (replace)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!copyToId || saving}
                      onClick={() => void copyTemplateTo()}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40"
                    >
                      Clone
                    </button>
                  </div>
                )}
                {/* Context load: only the pack that matches this product + flasher */}
                {productName.toLowerCase().includes("fd") &&
                  variant === "current" && (
                    <button
                      onClick={loadFdDefaults}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                      title="Fill with the transcribed IGLA FD screenshots"
                    >
                      Load transcribed defaults
                    </button>
                  )}
                {isAlarmProduct(productName) && variant === "current" && (
                  <button
                    onClick={loadAlarmDefaults}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                    title="Fill with the transcribed current Alarm flasher settings"
                  >
                    Load transcribed defaults
                  </button>
                )}
                {is231Product(productName) && variant === "current" && (
                  <button
                    onClick={load231Defaults}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                    title="Fill with the transcribed current 231 flasher settings"
                  >
                    Load transcribed defaults
                  </button>
                )}
                {is231Product(productName) && variant === "old" && (
                  <button
                    onClick={loadOldDefaults}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                    title="Reset to the transcribed older 231 flasher pack"
                  >
                    Reload transcribed defaults
                  </button>
                )}
                {isAlarmProduct(productName) && variant === "old" && (
                  <button
                    onClick={loadAlarmOldDefaults}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                    title="Reset to the transcribed older Alarm flasher pack"
                  >
                    Reload transcribed defaults
                  </button>
                )}
                <button
                  onClick={() => void save()}
                  disabled={saving || !dirty}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save template"}
                </button>
              </div>
            </div>

            <p className="mb-2 text-xs text-zinc-400">
              Drag ⠿ on the left to reorder sections and settings. Use Clone to
              duplicate a section, a setting (e.g. another wire colour), or the
              whole template onto another unit type. The outline on the right
              shows the full structure while you drag.
            </p>

            <div className="space-y-3">
              {doc.sections.map((section, si) => (
                <div
                  key={section.id}
                  id={`igla-section-${section.id}`}
                  className={`scroll-mt-28 rounded-xl border border-zinc-200 bg-white ${
                    sectionOver === si || sectionDragging === si
                      ? "ring-2 ring-zinc-400"
                      : ""
                  }`}
                  onDragOver={(e) => {
                    if (sectionDrag.current === null) return;
                    e.preventDefault();
                    if (sectionOver !== si) setSectionOver(si);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (sectionDrag.current !== null) {
                      const from = sectionDrag.current;
                      editSections((secs) => reorder(secs, from, si));
                    }
                    clearSectionDrag();
                  }}
                >
                  <div className="flex items-center gap-2 rounded-t-xl border-b border-zinc-100 bg-zinc-50 px-3 py-2">
                    <span
                      draggable
                      onDragStart={(e) => {
                        sectionDrag.current = si;
                        setSectionDragging(si);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", `section:${si}`);
                      }}
                      onDragEnd={clearSectionDrag}
                      title="Drag to reorder section"
                      className="shrink-0 cursor-grab select-none px-0.5 text-zinc-300 hover:text-zinc-600 active:cursor-grabbing"
                    >
                      ⠿
                    </span>
                    <input
                      value={section.title}
                      onChange={(e) =>
                        editSection(si, (s) => ({ ...s, title: e.target.value }))
                      }
                      className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => duplicateSection(si)}
                      className="rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                      title="Clone this section (and all its settings)"
                    >
                      Clone
                    </button>
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
                        highlight={
                          (rowOver?.si === si && rowOver?.ri === ri) ||
                          (rowDragging?.si === si && rowDragging?.ri === ri)
                        }
                        onChange={(fn) => editRow(si, ri, fn)}
                        onMove={(dir) => editSection(si, (s) => ({ ...s, rows: move(s.rows, ri, dir) }))}
                        onClone={() => duplicateRow(si, ri)}
                        onDelete={() =>
                          editSection(si, (s) => ({ ...s, rows: s.rows.filter((_, i) => i !== ri) }))
                        }
                        onDragHandleStart={(e) => {
                          rowDrag.current = { si, ri };
                          setRowDragging({ si, ri });
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", `row:${si}:${ri}`);
                        }}
                        onDragHandleEnd={clearRowDrag}
                        onDragOverRow={(e) => {
                          if (!rowDrag.current || rowDrag.current.si !== si) return;
                          e.preventDefault();
                          if (rowOver?.si !== si || rowOver?.ri !== ri) {
                            setRowOver({ si, ri });
                          }
                        }}
                        onDropRow={(e) => {
                          e.preventDefault();
                          e.stopPropagation(); // don't also drop as section reorder
                          const drag = rowDrag.current;
                          if (drag && drag.si === si) {
                            editSection(si, (s) => ({
                              ...s,
                              rows: reorder(s.rows, drag.ri, ri),
                            }));
                          }
                          clearRowDrag();
                        }}
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
            </div>

            {/* Compact structure map — stays visible while scrolling/dragging */}
            <TemplateOutline
              sections={doc.sections}
              sectionDragging={sectionDragging}
              sectionOver={sectionOver}
              rowDragging={rowDragging}
              rowOver={rowOver}
              onScrollToSection={scrollToSection}
              onSectionDragStart={(si, e) => {
                sectionDrag.current = si;
                setSectionDragging(si);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", `section:${si}`);
              }}
              onSectionDragEnd={clearSectionDrag}
              onSectionDragOver={(si) => {
                if (sectionDrag.current === null) return;
                if (sectionOver !== si) setSectionOver(si);
              }}
              onSectionDrop={(si) => {
                if (sectionDrag.current !== null) {
                  editSections((secs) => reorder(secs, sectionDrag.current!, si));
                }
                clearSectionDrag();
              }}
              onRowDragStart={(si, ri, e) => {
                rowDrag.current = { si, ri };
                setRowDragging({ si, ri });
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", `row:${si}:${ri}`);
              }}
              onRowDragEnd={clearRowDrag}
              onRowDragOver={(si, ri) => {
                if (!rowDrag.current || rowDrag.current.si !== si) return;
                if (rowOver?.si !== si || rowOver?.ri !== ri) setRowOver({ si, ri });
              }}
              onRowDrop={(si, ri) => {
                const drag = rowDrag.current;
                if (drag && drag.si === si) {
                  editSection(si, (s) => ({
                    ...s,
                    rows: reorder(s.rows, drag.ri, ri),
                  }));
                }
                clearRowDrag();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function shortLabel(s: string, max = 26): string {
  const t = s.replace(/\s+/g, " ").trim() || "Untitled";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function rowSnippet(row: IglaRow): string {
  if (row.control.type === "io" && row.control.wire.trim()) {
    const base = row.label.trim() || "Wire";
    return shortLabel(`${base} · ${row.control.wire}`);
  }
  return shortLabel(row.label || "Setting");
}

/** Sticky mini map of the template — section + setting names only. */
function TemplateOutline({
  sections,
  sectionDragging,
  sectionOver,
  rowDragging,
  rowOver,
  onScrollToSection,
  onSectionDragStart,
  onSectionDragEnd,
  onSectionDragOver,
  onSectionDrop,
  onRowDragStart,
  onRowDragEnd,
  onRowDragOver,
  onRowDrop,
}: {
  sections: IglaSection[];
  sectionDragging: number | null;
  sectionOver: number | null;
  rowDragging: { si: number; ri: number } | null;
  rowOver: { si: number; ri: number } | null;
  onScrollToSection: (sectionId: string) => void;
  onSectionDragStart: (si: number, e: DragEvent) => void;
  onSectionDragEnd: () => void;
  onSectionDragOver: (si: number) => void;
  onSectionDrop: (si: number) => void;
  onRowDragStart: (si: number, ri: number, e: DragEvent) => void;
  onRowDragEnd: () => void;
  onRowDragOver: (si: number, ri: number) => void;
  onRowDrop: (si: number, ri: number) => void;
}) {
  return (
    <aside className="xl:sticky xl:top-28 xl:w-56 xl:shrink-0">
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Template outline
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
            Drag here or in the editor. Click a section to jump to it.
          </p>
        </div>
        <div className="max-h-[min(70vh,36rem)] space-y-1.5 overflow-y-auto p-2">
          {sections.length === 0 && (
            <p className="px-1 py-3 text-center text-[11px] text-zinc-400">
              No sections yet
            </p>
          )}
          {sections.map((section, si) => {
            const secActive =
              sectionDragging === si || sectionOver === si;
            return (
              <div
                key={section.id}
                className={`rounded-lg border ${
                  secActive
                    ? "border-amber-300 bg-amber-50"
                    : "border-zinc-200 bg-zinc-50/80"
                }`}
                onDragOver={(e) => {
                  if (sectionDragging === null && !rowDragging) return;
                  // Prefer section reorder when a section is being dragged
                  if (sectionDragging !== null) {
                    e.preventDefault();
                    onSectionDragOver(si);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (sectionDragging !== null) onSectionDrop(si);
                }}
              >
                <div className="flex items-center gap-1 px-1.5 py-1">
                  <span
                    draggable
                    onDragStart={(e) => onSectionDragStart(si, e)}
                    onDragEnd={onSectionDragEnd}
                    title="Drag to reorder section"
                    className="cursor-grab select-none text-xs text-zinc-300 hover:text-zinc-600 active:cursor-grabbing"
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    onClick={() => onScrollToSection(section.id)}
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium text-zinc-800 hover:underline"
                    title={section.title || "Untitled section"}
                  >
                    {shortLabel(section.title || "Untitled section", 22)}
                  </button>
                  <span className="shrink-0 text-[10px] text-zinc-400">
                    {section.rows.length}
                  </span>
                </div>
                {section.rows.length > 0 && (
                  <ul className="space-y-0.5 border-t border-zinc-200/80 px-1 py-1">
                    {section.rows.map((row, ri) => {
                      const rowActive =
                        (rowDragging?.si === si && rowDragging.ri === ri) ||
                        (rowOver?.si === si && rowOver.ri === ri);
                      return (
                        <li
                          key={row.id}
                          className={`flex items-center gap-1 rounded px-1 py-0.5 ${
                            rowActive ? "bg-amber-100 ring-1 ring-amber-300" : ""
                          }`}
                          onDragOver={(e) => {
                            if (!rowDragging || rowDragging.si !== si) return;
                            e.preventDefault();
                            e.stopPropagation();
                            onRowDragOver(si, ri);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRowDrop(si, ri);
                          }}
                        >
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              onRowDragStart(si, ri, e);
                            }}
                            onDragEnd={onRowDragEnd}
                            title="Drag to reorder setting"
                            className="cursor-grab select-none text-[10px] text-zinc-300 hover:text-zinc-500 active:cursor-grabbing"
                          >
                            ⠿
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-[11px] text-zinc-500"
                            title={
                              row.control.type === "io" && row.control.wire
                                ? `${row.label} (${row.control.wire})`
                                : row.label
                            }
                          >
                            {rowSnippet(row)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Row + control-specific editors
// ---------------------------------------------------------------------------

function RowEditor({
  row,
  highlight,
  onChange,
  onMove,
  onClone,
  onDelete,
  onDragHandleStart,
  onDragHandleEnd,
  onDragOverRow,
  onDropRow,
}: {
  row: IglaRow;
  highlight?: boolean;
  onChange: (fn: (r: IglaRow) => IglaRow) => void;
  onMove: (dir: number) => void;
  onClone: () => void;
  onDelete: () => void;
  onDragHandleStart: (e: DragEvent) => void;
  onDragHandleEnd: () => void;
  onDragOverRow: (e: DragEvent) => void;
  onDropRow: (e: DragEvent) => void;
}) {
  const setControlType = (type: IglaControlType) =>
    onChange((r) => ({ ...r, control: blankControl(type) }));

  return (
    <div
      className={`px-3 py-2 ${highlight ? "bg-zinc-100 ring-2 ring-inset ring-zinc-400" : ""}`}
      onDragOver={onDragOverRow}
      onDrop={onDropRow}
    >
      <div className="flex items-start gap-2">
        <span
          draggable
          onDragStart={onDragHandleStart}
          onDragEnd={onDragHandleEnd}
          title="Drag to reorder setting"
          className="mt-1 shrink-0 cursor-grab select-none px-0.5 text-zinc-300 hover:text-zinc-600 active:cursor-grabbing"
        >
          ⠿
        </span>
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
        <button
          type="button"
          onClick={onClone}
          className="rounded px-1.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
          title="Clone this setting (e.g. same options, different wire)"
        >
          Clone
        </button>
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

  if (isExtraOptionsRow(row)) {
    const mode = c.type === "toggle" ? "toggle" : "flags";
    return (
      <div className="space-y-2 text-xs">
        <p className="text-zinc-500">
          Extra options can be <strong>Numbers 1–8</strong> (new flashers) or{" "}
          <strong>Enable / Disable</strong> (old flashers). Pick the style for
          this template:
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onChange((r) => ({
                ...r,
                control:
                  r.control.type === "flags"
                    ? r.control
                    : blankExtraOptionsFlags(),
              }))
            }
            className={`rounded-md border px-2 py-1 ${
              mode === "flags"
                ? "border-zinc-800 bg-zinc-800 text-white"
                : "border-zinc-300 bg-white hover:bg-zinc-100"
            }`}
          >
            Numbers 1–8
          </button>
          <button
            type="button"
            onClick={() =>
              onChange((r) => ({
                ...r,
                control: blankExtraOptionsToggle(),
              }))
            }
            className={`rounded-md border px-2 py-1 ${
              mode === "toggle"
                ? "border-zinc-800 bg-zinc-800 text-white"
                : "border-zinc-300 bg-white hover:bg-zinc-100"
            }`}
          >
            Enable / Disable
          </button>
        </div>
        {mode === "flags" && c.type === "flags" && (
          <div className="flex flex-wrap gap-1 pt-1">
            {c.options.map((o) => {
              const active = c.values.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? c.values.filter((id) => id !== o.id)
                      : [...c.values, o.id];
                    setC({ values: next });
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded border text-sm font-medium ${
                    active
                      ? "border-orange-300 text-zinc-900"
                      : "border-zinc-300 bg-white text-zinc-700"
                  }`}
                  style={active ? { backgroundColor: "#f5b086" } : undefined}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
        {mode === "flags" && c.type !== "flags" && (
          <button
            type="button"
            onClick={() =>
              onChange((r) => ({
                ...r,
                control: coerceToFlagsControl(r.control),
              }))
            }
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-100"
          >
            Apply Numbers 1–8 now
          </button>
        )}
        {mode === "toggle" && c.type === "toggle" && (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={c.value}
              onChange={(e) => setC({ value: e.target.checked })}
            />
            Default on (Enabled)
          </label>
        )}
      </div>
    );
  }

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

  if (c.type === "flags") {
    const on = new Set(c.values);
    return (
      <div className="space-y-2 text-xs">
        <p className="text-zinc-500">
          Click squares to set which options are on by default (orange = on).
        </p>
        <div className="flex flex-wrap gap-1">
          {c.options.map((o) => {
            const active = on.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  const next = active
                    ? c.values.filter((id) => id !== o.id)
                    : [...c.values, o.id];
                  setC({ values: next });
                }}
                className={`flex h-8 w-8 items-center justify-center rounded border text-sm font-medium ${
                  active
                    ? "border-orange-300 text-zinc-900"
                    : "border-zinc-300 bg-white text-zinc-700"
                }`}
                style={active ? { backgroundColor: "#f5b086" } : undefined}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <OptionList
          options={c.options}
          value={null}
          allowAdd
          onOptions={(options) => {
            const ids = new Set(options.map((o) => o.id));
            setC({
              options,
              values: c.values.filter((id) => ids.has(id)),
            });
          }}
          onValue={() => {}}
        />
      </div>
    );
  }

  if (c.type === "select") {
    const carConfig = isCarConfigurationRow(row);
    return (
      <div className="space-y-1.5">
        {carConfig && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
            Car configuration names are typed in while editing a guide. New names
            appear here automatically. You can reorder or remove them; add new
            ones from the guide editor.
          </p>
        )}
        <OptionList
          options={c.options}
          value={c.value}
          allowAdd={!carConfig}
          onOptions={(options, value) => setC({ options, value })}
          onValue={(value) => setC({ value })}
        />
      </div>
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
  allowAdd = true,
}: {
  options: IglaOption[];
  value: string | null;
  onOptions: (options: IglaOption[], value: string | null) => void;
  onValue: (value: string | null) => void;
  /** False for Car configuration — names come from guide editors. */
  allowAdd?: boolean;
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
      {options.length === 0 && !allowAdd && (
        <p className="text-[11px] text-zinc-400">No configurations yet — add one in a guide.</p>
      )}
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
      {allowAdd && (
        <button
          onClick={add}
          className="rounded border border-dashed border-zinc-300 px-1.5 py-0.5 text-zinc-500 hover:text-zinc-700"
        >
          + option
        </button>
      )}
    </div>
  );
}
