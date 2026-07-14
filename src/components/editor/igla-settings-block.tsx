"use client";
// The per-guide "Igla settings" block editor. Structure is FROZEN (snapshot of
// the product template at add-time); only an admin edits the per-car VALUES.
// Techs (and the read-only viewer) see the exact same layout without controls —
// a faithful copy of the official Igla software so an installer can flash the
// unit exactly. Styled light for the editor; the served viewer has its own
// dark/light read-only renderer (see guild-view).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import type { IglaConfigDoc, IglaControl, IglaSection } from "@/lib/igla-config";

type Content = { productId?: string; productName?: string; sections?: IglaSection[] };

export default function IglaSettingsBlockEditor({
  c,
  update,
  isAdmin,
}: {
  c: Content;
  update: (content: any) => void;
  isAdmin: boolean;
}) {
  const doc: IglaConfigDoc = { sections: c.sections ?? [], productId: c.productId, productName: c.productName };

  // Replace the control of one row (by section+row id) and push the new content.
  const setControl = (sid: string, rid: string, control: IglaControl) => {
    const sections = doc.sections.map((s) =>
      s.id !== sid ? s : { ...s, rows: s.rows.map((r) => (r.id === rid ? { ...r, control } : r)) }
    );
    update({ ...c, sections });
  };

  if (doc.sections.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-400">
        Empty Igla settings block — its unit type has no template yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
        <span>⚙ Igla settings</span>
        {doc.productName && <span className="rounded bg-white px-1.5 py-0.5 text-zinc-500">{doc.productName}</span>}
        {!isAdmin && <span className="ml-auto text-zinc-400">read-only</span>}
      </div>
      {doc.sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          isAdmin={isAdmin}
          onControl={(rid, control) => setControl(section.id, rid, control)}
        />
      ))}
    </div>
  );
}

function SectionBlock({
  section,
  isAdmin,
  onControl,
}: {
  section: IglaSection;
  isAdmin: boolean;
  onControl: (rid: string, control: IglaControl) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-zinc-100 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
        {section.title}
      </button>
      {open && (
        <div className="divide-y divide-zinc-50">
          {section.rows.map((row) => (
            <div key={row.id} className="flex items-start gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-1 items-start gap-1 pt-1 text-sm text-zinc-700">
                <span className="min-w-0">{row.label}</span>
                {row.help && (
                  <span className="cursor-help text-zinc-300" title={row.help}>
                    ?
                  </span>
                )}
              </div>
              <div className="w-[58%] shrink-0">
                <ControlField control={row.control} isAdmin={isAdmin} onChange={onControl.bind(null, row.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One editable/read-only control, matching the software's look.
function ControlField({
  control,
  isAdmin,
  onChange,
}: {
  control: IglaControl;
  isAdmin: boolean;
  onChange: (control: IglaControl) => void;
}) {
  const c = control;

  if (c.type === "toggle") {
    const label = c.value ? c.onLabel ?? "Enabled" : c.offLabel ?? "Disabled";
    return (
      <div className="flex items-center gap-2">
        <button
          disabled={!isAdmin}
          onClick={() => onChange({ ...c, value: !c.value })}
          className={`relative h-5 w-9 rounded-full transition ${
            c.value ? "bg-orange-500" : "bg-zinc-300"
          } ${isAdmin ? "cursor-pointer" : "cursor-default"}`}
          title={isAdmin ? "Toggle" : undefined}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              c.value ? "left-[1.15rem]" : "left-0.5"
            }`}
          />
        </button>
        <span className="text-sm text-zinc-600">{label}</span>
      </div>
    );
  }

  if (c.type === "select") {
    if (!isAdmin) {
      const label = c.options.find((o) => o.id === c.value)?.label ?? "—";
      return <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700">{label}</div>;
    }
    return (
      <select
        value={c.value ?? ""}
        onChange={(e) => onChange({ ...c, value: e.target.value || null })}
        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
      >
        {c.value == null && <option value="">—</option>}
        {c.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (c.type === "slider") {
    const pct = c.max > c.min ? ((c.value - c.min) / (c.max - c.min)) * 100 : 0;
    return (
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-right text-xs text-zinc-400">{c.min}</span>
        {isAdmin ? (
          <input
            type="range"
            min={c.min}
            max={c.max}
            value={c.value}
            onChange={(e) => onChange({ ...c, value: Number(e.target.value) })}
            className="igla-range h-1 flex-1 cursor-pointer"
            style={{ accentColor: "#f97316" }}
          />
        ) : (
          <div className="relative h-1 flex-1 rounded bg-zinc-200">
            <div className="absolute inset-y-0 left-0 rounded bg-orange-500" style={{ width: `${pct}%` }} />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-orange-500"
              style={{ left: `calc(${pct}% - 6px)` }}
            />
          </div>
        )}
        <span className="w-8 shrink-0 text-xs text-zinc-400">{c.max}</span>
        <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-zinc-700">{c.value}</span>
      </div>
    );
  }

  if (c.type === "number") {
    return (
      <div className="flex items-center gap-1">
        {c.segments.map((seg) => (
          <input
            key={seg.id}
            value={seg.value}
            disabled={!isAdmin}
            onChange={(e) =>
              onChange({
                ...c,
                segments: c.segments.map((s) => (s.id === seg.id ? { ...s, value: e.target.value } : s)),
              })
            }
            className="w-14 rounded-md border border-zinc-300 px-2 py-1.5 text-center text-sm disabled:bg-zinc-50 disabled:text-zinc-600"
          />
        ))}
        {c.unit && <span className="ml-1 text-xs text-zinc-400">{c.unit}</span>}
      </div>
    );
  }

  // io
  const dirLabel = c.direction.options.find((o) => o.id === c.direction.value)?.label ?? "—";
  const dirEditable = isAdmin && !c.direction.locked;
  return (
    <div className="space-y-1.5">
      {dirEditable ? (
        <select
          value={c.direction.value ?? ""}
          onChange={(e) => onChange({ ...c, direction: { ...c.direction, value: e.target.value || null } })}
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          {c.direction.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-500">{dirLabel}</div>
      )}
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span>Signal inversion</span>
        <button
          disabled={!isAdmin}
          onClick={() => onChange({ ...c, inversion: !c.inversion })}
          className={`relative h-5 w-9 rounded-full transition ${c.inversion ? "bg-orange-500" : "bg-zinc-300"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${c.inversion ? "left-[1.15rem]" : "left-0.5"}`} />
        </button>
        <span>{c.inversion ? "On" : "Off"}</span>
      </div>
      {isAdmin ? (
        <select
          value={c.func.value ?? ""}
          onChange={(e) => onChange({ ...c, func: { ...c.func, value: e.target.value || null } })}
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          {c.func.value == null && <option value="">—</option>}
          {c.func.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700">
          {c.func.options.find((o) => o.id === c.func.value)?.label ?? "—"}
        </div>
      )}
    </div>
  );
}
