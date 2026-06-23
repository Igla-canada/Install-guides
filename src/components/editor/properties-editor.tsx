"use client";
// The grey properties box from the reference pages (key/value metadata).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import type { ClientDoc } from "./types";

export default function PropertiesEditor({
  doc,
  dispatch,
}: {
  doc: ClientDoc;
  dispatch: (ops: any[]) => Promise<void>;
}) {
  const props = doc.properties ?? {};
  // "IGLA Type" is derived from the guide's real product coverage, not free
  // text — show it read-only here and hide it from the editable list so it
  // can't drift from what the portal actually matches on.
  const realProducts = (
    doc.products?.length ? doc.products.map((p) => p.iglaProduct.name) : [doc.iglaProduct.name]
  ).join(", ");
  const entries = Object.entries(props).filter(([k]) => k !== "IGLA Type");
  const [open, setOpen] = useState(true);
  const [newKey, setNewKey] = useState("");

  const save = (next: Record<string, string>) =>
    void dispatch([{ op: "update_properties", properties: next }]);

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center px-4 py-2 text-left text-sm font-medium text-zinc-600"
      >
        Properties{entries.length > 0 ? ` (${entries.length})` : ""}
        <span className="ml-auto text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-200 p-4">
          {/* Derived, read-only — comes from the Igla product(s) in identity. */}
          <div className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-sm font-medium text-zinc-500">
              IGLA Type
            </span>
            <span className="flex-1 rounded-md bg-zinc-50 px-2 py-1 text-sm text-zinc-600">
              {realProducts || "—"}
            </span>
            <span className="text-xs text-zinc-400" title="Set via Igla product(s) in the identity panel">
              auto
            </span>
          </div>
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-sm font-medium text-zinc-500">
                {k}
              </span>
              <input
                defaultValue={v}
                onBlur={(e) => {
                  if (e.target.value !== v) save({ ...props, [k]: e.target.value });
                }}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
              />
              <button
                onClick={() => {
                  const next = { ...props };
                  delete next[k];
                  save(next);
                }}
                className="text-zinc-400 hover:text-red-600"
                title="Remove property"
              >
                ✕
              </button>
            </div>
          ))}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const k = newKey.trim();
              if (!k || k in props) return;
              save({ ...props, [k]: "" });
              setNewKey("");
            }}
          >
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Add property (e.g. Security pack, CAN bus)"
              className="flex-1 rounded-md border border-dashed border-zinc-300 bg-white px-2 py-1 text-sm"
            />
            <button className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100">
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
