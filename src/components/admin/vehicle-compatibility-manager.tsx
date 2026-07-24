"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  createCompatibilityRecord,
  deleteCompatibilityRecord,
  setCompatibilityVisibilityBulk,
  updateCompatibilityRecord,
} from "@/lib/vehicle-compatibility-actions";
import {
  baseModelName,
  buildYearOptions,
  expandIglaProducts,
  formatIglaProducts,
  IGLA_PRODUCT_OPTIONS,
  modelBaseKey,
  modelMatchesBase,
  yearsLabel,
} from "@/lib/vehicle-compatibility";
import VehicleCascadeSearch from "@/components/vehicle-cascade-search";

export type CompatRow = {
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
  additionalBlockRequired: boolean;
  additionalBlockDetails: string | null;
  installationNotes: string | null;
  dealerNotes: string | null;
  internalAdminNotes: string | null;
  isVisibleToDealers: boolean;
  iglaProducts: string[];
  sourceGuideId: string | null;
  sourceGuideStatus: string | null;
  liveGuideStatus?: string | null;
  updatedAt: string;
};

type Dupe = {
  id: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number | null;
  trim: string | null;
};

type FormState = {
  make: string;
  model: string;
  yearFrom: string;
  yearTo: string;
  trim: string;
  engineType: string;
  transmissionType: string;
  analogBlockRequired: string;
  analogBlockType: string;
  additionalBlockRequired: string;
  additionalBlockDetails: string;
  installationNotes: string;
  dealerNotes: string;
  internalAdminNotes: string;
  isVisibleToDealers: string;
  sourceGuideId: string;
  igla231: boolean;
  iglaAlarm: boolean;
  iglaFd: boolean;
  iglaBase: boolean;
};

const emptyForm: FormState = {
  make: "",
  model: "",
  yearFrom: String(new Date().getFullYear()),
  yearTo: String(new Date().getFullYear()),
  trim: "",
  engineType: "",
  transmissionType: "",
  analogBlockRequired: "no",
  analogBlockType: "",
  additionalBlockRequired: "no",
  additionalBlockDetails: "",
  installationNotes: "",
  dealerNotes: "",
  internalAdminNotes: "",
  isVisibleToDealers: "yes",
  sourceGuideId: "",
  igla231: false,
  iglaAlarm: false,
  iglaFd: false,
  iglaBase: false,
};

function productsFromForm(form: FormState): string[] {
  const selected: string[] = [];
  if (form.igla231) {
    selected.push("IGLA 231", "IGLA Alarm");
  } else if (form.iglaAlarm) {
    selected.push("IGLA Alarm");
  }
  if (form.iglaFd) selected.push("IGLA FD");
  if (form.iglaBase) selected.push("IGLA BASE 2CAN");
  return expandIglaProducts(selected);
}

function formFromRow(row: CompatRow): FormState {
  return {
    make: row.make,
    model: row.model,
    yearFrom: String(row.yearFrom),
    yearTo: row.yearTo == null ? "" : String(row.yearTo),
    trim: row.trim ?? "",
    engineType: row.engineType ?? "",
    transmissionType: row.transmissionType ?? "",
    analogBlockRequired: row.analogBlockRequired ? "yes" : "no",
    analogBlockType: row.analogBlockType ?? "",
    additionalBlockRequired: row.additionalBlockRequired ? "yes" : "no",
    additionalBlockDetails: row.additionalBlockDetails ?? "",
    installationNotes: row.installationNotes ?? "",
    dealerNotes: row.dealerNotes ?? "",
    internalAdminNotes: row.internalAdminNotes ?? "",
    isVisibleToDealers: row.isVisibleToDealers ? "yes" : "no",
    sourceGuideId: row.sourceGuideId ?? "",
    igla231: row.iglaProducts.includes("IGLA 231"),
    iglaAlarm:
      row.iglaProducts.includes("IGLA Alarm") ||
      row.iglaProducts.includes("IGLA 231"),
    iglaFd: row.iglaProducts.includes("IGLA FD"),
    iglaBase: row.iglaProducts.includes("IGLA BASE 2CAN"),
  };
}

function keepRowInView(id: string) {
  requestAnimationFrame(() => {
    document
      .getElementById(`compat-row-${id}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  });
}

export default function VehicleCompatibilityManager({
  initialRows,
}: {
  initialRows: CompatRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [filterMake, setFilterMake] = useState("");
  const [filterModel, setFilterModel] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterAnalog, setFilterAnalog] = useState<"all" | "yes" | "no">("all");
  const [filterVisible, setFilterVisible] = useState<"all" | "yes" | "no">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<Dupe[]>([]);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const editing = editingId ? rows.find((r) => r.id === editingId) ?? null : null;

  const cascadeTaxonomy = useMemo(() => {
    const byMake = new Map<string, Map<string, string>>();
    for (const r of rows) {
      const base = baseModelName(r.model);
      if (!base) continue;
      const key = modelBaseKey(r.model);
      let map = byMake.get(r.make);
      if (!map) {
        map = new Map();
        byMake.set(r.make, map);
      }
      const existing = map.get(key);
      if (
        !existing ||
        base.length < existing.length ||
        (!base.includes("-") && existing.includes("-"))
      ) {
        map.set(key, base);
      }
    }
    const modelsByMake: Record<string, string[]> = {};
    for (const [make, map] of byMake) {
      modelsByMake[make] = [...map.values()].sort((a, b) => a.localeCompare(b));
    }
    return {
      makes: Object.keys(modelsByMake).sort((a, b) => a.localeCompare(b)),
      modelsByMake,
      yearOptions: buildYearOptions(
        rows.map((r) => ({ yearFrom: r.yearFrom, yearTo: r.yearTo })),
      ),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const yearNum = filterYear ? Number(filterYear) : NaN;
    return rows.filter((r) => {
      if (filterAnalog === "yes" && !r.analogBlockRequired) return false;
      if (filterAnalog === "no" && r.analogBlockRequired) return false;
      if (filterVisible === "yes" && !r.isVisibleToDealers) return false;
      if (filterVisible === "no" && r.isVisibleToDealers) return false;
      if (
        filterMake &&
        r.make.localeCompare(filterMake, undefined, { sensitivity: "accent" }) !== 0
      ) {
        return false;
      }
      if (filterModel && !modelMatchesBase(r.model, filterModel)) return false;
      if (!Number.isNaN(yearNum)) {
        if (yearNum < r.yearFrom) return false;
        if (r.yearTo != null && yearNum > r.yearTo) return false;
      }
      return true;
    });
  }, [rows, filterMake, filterModel, filterYear, filterAnalog, filterVisible]);

  function guideStatus(r: CompatRow) {
    return r.liveGuideStatus ?? r.sourceGuideStatus ?? null;
  }

  const counts = useMemo(() => {
    let published = 0;
    let draft = 0;
    let other = 0;
    let dealerVisible = 0;
    for (const r of rows) {
      if (r.isVisibleToDealers) dealerVisible++;
      const s = guideStatus(r);
      if (s === "PUBLISHED") published++;
      else if (s === "DRAFT") draft++;
      else other++;
    }
    return {
      total: rows.length,
      filtered: filtered.length,
      published,
      draft,
      other,
      dealerVisible,
    };
  }, [rows, filtered]);

  function closeEdit() {
    const id = editingId;
    setEditingId(null);
    setError(null);
    setDupes([]);
    if (id) keepRowInView(id);
  }

  function openCreate() {
    setEditingId(null);
    setCreating(true);
    setForm(emptyForm);
    setError(null);
    setDupes([]);
  }

  function openEdit(row: CompatRow) {
    if (editingId === row.id) {
      closeEdit();
      return;
    }
    setCreating(false);
    setEditingId(row.id);
    setForm(formFromRow(row));
    setError(null);
    setDupes([]);
    keepRowInView(row.id);
  }

  function toFormData(force = false) {
    const fd = new FormData();
    if (editingId) fd.set("id", editingId);
    for (const [k, v] of Object.entries(form)) {
      if (k.startsWith("igla")) continue;
      fd.set(k, String(v));
    }
    for (const p of productsFromForm(form)) fd.append("iglaProducts", p);
    if (force) fd.set("force", "1");
    return fd;
  }

  function applyFormToRow(base: CompatRow): CompatRow {
    return {
      ...base,
      make: form.make.trim(),
      model: form.model.trim(),
      yearFrom: Number(form.yearFrom),
      yearTo: form.yearTo.trim() === "" ? null : Number(form.yearTo),
      trim: form.trim.trim() || null,
      engineType: form.engineType.trim() || null,
      transmissionType: form.transmissionType.trim() || null,
      analogBlockRequired: form.analogBlockRequired === "yes",
      analogBlockType:
        form.analogBlockRequired === "yes" ? form.analogBlockType.trim() || null : null,
      additionalBlockRequired: form.additionalBlockRequired === "yes",
      additionalBlockDetails:
        form.additionalBlockRequired === "yes"
          ? form.additionalBlockDetails.trim() || null
          : null,
      installationNotes: form.installationNotes.trim() || null,
      dealerNotes: form.dealerNotes.trim() || null,
      internalAdminNotes: form.internalAdminNotes.trim() || null,
      isVisibleToDealers: form.isVisibleToDealers !== "no",
      iglaProducts: productsFromForm(form),
      sourceGuideId: form.sourceGuideId.trim() || null,
      updatedAt: new Date().toISOString(),
    };
  }

  function submit(force = false) {
    setError(null);
    setDupes([]);
    const stayId = editingId;
    startTransition(async () => {
      const result = editingId
        ? await updateCompatibilityRecord(toFormData(force))
        : await createCompatibilityRecord(toFormData(force));
      if (!result.ok) {
        if (result.error === "duplicate" && "duplicates" in result) {
          setDupes(result.duplicates ?? []);
          setError(
            "This looks like a duplicate of an existing record (same make/model/years/config). Save anyway only if the installation requirements truly differ."
          );
          return;
        }
        setError(result.error);
        return;
      }
      if (editingId) {
        setRows((prev) =>
          prev.map((r) => (r.id === editingId ? applyFormToRow(r) : r))
        );
        setEditingId(null);
        setError(null);
        setDupes([]);
        if (stayId) keepRowInView(stayId);
      } else {
        setCreating(false);
        // New row — soft reload only for create so it appears with server id.
        window.location.reload();
      }
    });
  }

  function formPanel(title: string, onClose: () => void) {
    return (
      <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            ✕ Close
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["make", "Make *", "text"],
              ["model", "Model *", "text"],
              ["yearFrom", "Year From *", "number"],
              ["yearTo", "Year To (blank = present)", "number"],
              ["trim", "Trim / Configuration", "text"],
              ["engineType", "Engine Type", "text"],
              ["transmissionType", "Transmission Type", "text"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="block text-sm">
              <span className="text-zinc-600">{label}</span>
              <input
                type={type}
                value={form[key]}
                placeholder={key === "yearTo" ? "Leave blank for present" : undefined}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
              />
            </label>
          ))}

          <label className="block text-sm">
            <span className="text-zinc-600">Analog Blocking Required</span>
            <select
              value={form.analogBlockRequired}
              onChange={(e) =>
                setForm((f) => ({ ...f, analogBlockRequired: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600">
              Analog Blocking Type{form.analogBlockRequired === "yes" ? " *" : ""}
            </span>
            <input
              value={form.analogBlockType}
              disabled={form.analogBlockRequired !== "yes"}
              onChange={(e) =>
                setForm((f) => ({ ...f, analogBlockType: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 disabled:bg-zinc-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600">Additional Blocking Required</span>
            <select
              value={form.additionalBlockRequired}
              onChange={(e) =>
                setForm((f) => ({ ...f, additionalBlockRequired: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-zinc-600">
              Additional Blocking Details
              {form.additionalBlockRequired === "yes" ? " *" : ""}
            </span>
            <input
              value={form.additionalBlockDetails}
              disabled={form.additionalBlockRequired !== "yes"}
              onChange={(e) =>
                setForm((f) => ({ ...f, additionalBlockDetails: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 disabled:bg-zinc-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600">Visible to Dealers</span>
            <select
              value={form.isVisibleToDealers}
              onChange={(e) =>
                setForm((f) => ({ ...f, isVisibleToDealers: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <fieldset className="sm:col-span-2 lg:col-span-3">
            <legend className="text-sm text-zinc-600">Which IGLA works</legend>
            <p className="mt-0.5 text-xs text-zinc-400">
              Checking IGLA 231 also marks IGLA Alarm (231 ⇒ Alarm). Alarm alone
              does not imply 231.
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["igla231", "IGLA 231"],
                  ["iglaAlarm", "IGLA Alarm"],
                  ["iglaFd", "IGLA FD"],
                  ["iglaBase", "IGLA BASE 2CAN"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      key === "iglaAlarm" ? form.iglaAlarm || form.igla231 : form[key]
                    }
                    disabled={key === "iglaAlarm" && form.igla231}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setForm((f) => {
                        if (key === "igla231") {
                          return { ...f, igla231: on, iglaAlarm: on ? true : f.iglaAlarm };
                        }
                        return { ...f, [key]: on };
                      });
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Options: {IGLA_PRODUCT_OPTIONS.join(", ")}
            </p>
          </fieldset>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="text-zinc-600">Installation Notes</span>
            <textarea
              value={form.installationNotes}
              onChange={(e) =>
                setForm((f) => ({ ...f, installationNotes: e.target.value }))
              }
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
            />
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="text-zinc-600">Dealer Notes</span>
            <textarea
              value={form.dealerNotes}
              onChange={(e) => setForm((f) => ({ ...f, dealerNotes: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
            />
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="text-zinc-600">Internal Admin Notes (never shown to dealers)</span>
            <textarea
              value={form.internalAdminNotes}
              onChange={(e) =>
                setForm((f) => ({ ...f, internalAdminNotes: e.target.value }))
              }
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-zinc-600">Source guide id (optional, read-only provenance)</span>
            <input
              value={form.sourceGuideId}
              onChange={(e) =>
                setForm((f) => ({ ...f, sourceGuideId: e.target.value }))
              }
              placeholder="Does not control or edit the guide"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs"
            />
          </label>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {error}
            {dupes.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {dupes.map((d) => (
                  <li key={d.id}>
                    {d.make} {d.model} {yearsLabel(d.yearFrom, d.yearTo)}
                    {d.trim ? ` · ${d.trim}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(false)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {dupes.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(true)}
              className="rounded-md border border-amber-400 bg-amber-100 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-200"
            >
              Save anyway (not a duplicate)
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-zinc-500">
        Vehicle compatibility for dealers — separate from guide management. Editing
        these records never changes guides, publishing status, or wiring content.
      </p>

      <div className="flex flex-wrap gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
        <div>
          <div className="text-xs uppercase text-zinc-400">Vehicle count</div>
          <div className="text-2xl font-semibold tabular-nums">{counts.total}</div>
        </div>
        <div className="border-l border-zinc-200 pl-3">
          <div className="text-xs uppercase text-zinc-400">Showing</div>
          <div className="text-2xl font-semibold tabular-nums">{counts.filtered}</div>
        </div>
        <div className="border-l border-zinc-200 pl-3">
          <div className="text-xs uppercase text-zinc-400">Published guides</div>
          <div className="text-lg font-semibold tabular-nums text-green-800">
            {counts.published}
          </div>
        </div>
        <div className="border-l border-zinc-200 pl-3">
          <div className="text-xs uppercase text-zinc-400">Draft guides</div>
          <div className="text-lg font-semibold tabular-nums text-amber-800">
            {counts.draft}
          </div>
        </div>
        <div className="border-l border-zinc-200 pl-3">
          <div className="text-xs uppercase text-zinc-400">Dealer visible</div>
          <div className="text-lg font-semibold tabular-nums">{counts.dealerVisible}</div>
        </div>
      </div>

      <VehicleCascadeSearch
        makes={cascadeTaxonomy.makes}
        modelsByMake={cascadeTaxonomy.modelsByMake}
        yearOptions={cascadeTaxonomy.yearOptions}
        initial={{
          make: filterMake,
          model: filterModel,
          year: filterYear,
        }}
        onApply={(f) => {
          setFilterMake(f.make);
          setFilterModel(f.model);
          setFilterYear(f.year);
        }}
      />

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Analog block</label>
          <select
            value={filterAnalog}
            onChange={(e) => setFilterAnalog(e.target.value as "all" | "yes" | "no")}
            className="mt-1 rounded-md border border-zinc-300 px-2 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="yes">Required</option>
            <option value="no">Not required</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Dealer visible</label>
          <select
            value={filterVisible}
            onChange={(e) => setFilterVisible(e.target.value as "all" | "yes" | "no")}
            className="mt-1 rounded-md border border-zinc-300 px-2 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + Add record
        </button>
      </div>

      {creating &&
        formPanel("New compatibility record", () => {
          setCreating(false);
          setError(null);
          setDupes([]);
        })}

      {(() => {
        const filteredIds = filtered.map((r) => r.id);
        const selectedInView = filteredIds.filter((id) => selected.has(id));
        const allFilteredSelected =
          filteredIds.length > 0 && selectedInView.length === filteredIds.length;
        const someFilteredSelected =
          selectedInView.length > 0 && !allFilteredSelected;

        function toggleSelectAll() {
          setSelected((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) {
              for (const id of filteredIds) next.delete(id);
            } else {
              for (const id of filteredIds) next.add(id);
            }
            return next;
          });
        }

        function applyVisibility(
          visible: boolean,
          ids: string[],
          clearSelection = true,
        ) {
          if (!ids.length) return;
          startTransition(async () => {
            const res = await setCompatibilityVisibilityBulk(ids, visible);
            if (!res.ok) return;
            const idSet = new Set(ids);
            setRows((prev) =>
              prev.map((x) =>
                idSet.has(x.id) ? { ...x, isVisibleToDealers: visible } : x,
              ),
            );
            if (clearSelection) setSelected(new Set());
          });
        }

        return (
          <>
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                <span className="font-medium tabular-nums text-zinc-800">
                  {selected.size} selected
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    applyVisibility(false, [...selected])
                  }
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
                >
                  Hide selected from list
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => applyVisibility(true, [...selected])}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
                >
                  Show selected on list
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
              <table className="w-full min-w-[960px] text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someFilteredSelected;
                        }}
                        onChange={toggleSelectAll}
                        title="Select all vehicles in this filtered list"
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2">Vehicle</th>
                    <th className="px-3 py-2">Years</th>
                    <th className="px-3 py-2">IGLA</th>
                    <th className="px-3 py-2">Guide</th>
                    <th className="px-3 py-2">Config</th>
                    <th className="px-3 py-2">Analog block</th>
                    <th className="px-3 py-2" title="Checked = hidden from dealer list">
                      Hide
                    </th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const status = guideStatus(r);
                    const isOpen = editingId === r.id;
                    const isSelected = selected.has(r.id);
                    const hidden = !r.isVisibleToDealers;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          id={`compat-row-${r.id}`}
                          className={`border-b border-zinc-100 align-top last:border-0 ${
                            isOpen
                              ? "bg-amber-50/60"
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
                              aria-label={`Select ${r.make} ${r.model}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">
                              {r.make} {r.model}
                            </div>
                            {r.sourceGuideId && (
                              <div className="font-mono text-[10px] text-zinc-400">
                                src: {r.sourceGuideId.slice(0, 12)}…
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {yearsLabel(r.yearFrom, r.yearTo)}
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-zinc-800">
                            {formatIglaProducts(r.iglaProducts)}
                          </td>
                          <td className="px-3 py-2">
                            {status ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  status === "PUBLISHED"
                                    ? "bg-green-100 text-green-800"
                                    : status === "DRAFT"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-zinc-100 text-zinc-600"
                                }`}
                                title="Source guide status (read-only; does not control the guide)"
                              >
                                {status.toLowerCase()}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-600">
                            {[r.trim, r.engineType, r.transmissionType]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {r.analogBlockRequired ? (
                              <span className="text-amber-800">
                                Yes
                                {r.analogBlockType
                                  ? `: ${r.analogBlockType}`
                                  : ""}
                              </span>
                            ) : (
                              <span className="text-zinc-400">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <label
                              className="inline-flex items-center gap-1.5 text-xs text-zinc-600"
                              title="Hide this vehicle from the dealer compatibility list"
                            >
                              <input
                                type="checkbox"
                                checked={hidden}
                                disabled={pending}
                                onChange={() => {
                                  // Flip: if currently hidden, show; if shown, hide.
                                  applyVisibility(hidden, [r.id], false);
                                }}
                              />
                              <span className={hidden ? "text-zinc-800" : "text-zinc-400"}>
                                {hidden ? "hidden" : "hide"}
                              </span>
                            </label>
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-500">
                            {r.updatedAt.slice(0, 10)}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="mr-2 text-xs text-zinc-700 hover:underline"
                            >
                              {isOpen ? "Close" : "Edit"}
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              className="text-xs text-red-600 hover:underline"
                              onClick={() => {
                                if (
                                  !confirm(
                                    "Delete this compatibility record? Guides are not affected.",
                                  )
                                )
                                  return;
                                const fd = new FormData();
                                fd.set("id", r.id);
                                startTransition(async () => {
                                  const res = await deleteCompatibilityRecord(fd);
                                  if (res.ok) {
                                    if (editingId === r.id) setEditingId(null);
                                    setRows((prev) =>
                                      prev.filter((x) => x.id !== r.id),
                                    );
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      next.delete(r.id);
                                      return next;
                                    });
                                  }
                                });
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                        {isOpen && editing && (
                          <tr className="border-b border-amber-200 bg-amber-50/40">
                            <td colSpan={10} className="px-3 py-3">
                              {formPanel(
                                `Edit · ${editing.make} ${editing.model} ${yearsLabel(
                                  editing.yearFrom,
                                  editing.yearTo,
                                )}`,
                                closeEdit,
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-3 py-8 text-center text-sm text-zinc-500"
                      >
                        No compatibility records match this search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
      <p className="text-xs text-zinc-400">
        Showing {counts.filtered} of {counts.total} vehicle
        {counts.total === 1 ? "" : "s"}
      </p>
    </div>
  );
}
