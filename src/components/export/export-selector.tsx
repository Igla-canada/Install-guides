"use client";
import { useMemo, useState } from "react";

type Item = {
  id: string;
  title: string;
  sub: string;
  status: string;
  createdAt: string;
  lastExportedAt: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ExportSelector({ items }: { items: Item[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)
    );
  }, [items, query]);

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = () => setSel(new Set(filtered.map((i) => i.id))); // select what's visible
  const none = () => setSel(new Set());

  const download = () => {
    if (sel.size === 0) return;
    // open the render page in a new tab; it builds the combined PDF
    window.open(`/export/pdf?ids=${[...sel].join(",")}`, "_blank");
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by make / model / product…"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={all} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
          Select all{query ? " shown" : ""}
        </button>
        <button onClick={none} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
          Clear
        </button>
        <span className="text-xs text-zinc-400">
          {filtered.length} of {items.length}
        </span>
        <button
          onClick={download}
          disabled={sel.size === 0}
          className="ml-auto rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          ⬇ Download {sel.size > 0 ? `${sel.size} ` : ""}as PDF
        </button>
      </div>

      <ul className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {filtered.map((it) => (
          <li key={it.id} className="border-b border-zinc-100 last:border-0">
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={sel.has(it.id)}
                onChange={() => toggle(it.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium">{it.title}</span>
                <span className="block text-xs text-zinc-500">{it.sub}</span>
                <span className="mt-0.5 block text-xs text-zinc-400">
                  Added {fmtDate(it.createdAt)} ·{" "}
                  {it.lastExportedAt
                    ? `Last exported ${fmtDate(it.lastExportedAt)}`
                    : "Never exported"}
                </span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  it.status === "PUBLISHED"
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {it.status.toLowerCase()}
              </span>
            </label>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-400">
            {items.length === 0 ? "No guides to export." : "No guides match your search."}
          </li>
        )}
      </ul>
    </div>
  );
}
