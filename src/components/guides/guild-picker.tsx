"use client";
// Searchable multi-select of published guides for the access-link form. The
// real selection lives in React state and is submitted via hidden `guildIds`
// inputs, so it survives filtering (a guide you picked stays picked even after
// you type a search that hides it) and powers a "select all shown" checkbox.
import { useMemo, useState } from "react";

type PickGuild = { id: string; title: string; sub: string };

export default function GuildPicker({ guilds }: { guilds: PickGuild[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter(
      (g) => g.title.toLowerCase().includes(q) || g.sub.toLowerCase().includes(q)
    );
  }, [guilds, query]);

  if (guilds.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Nothing published yet — publish a guide first.
      </p>
    );
  }

  const filteredIds = filtered.map((g) => g.id);
  const allShownSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someShownSelected = filteredIds.some((id) => selected.has(id));
  const filtering = query.trim().length > 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });

  return (
    <div>
      {/* Selection travels in hidden inputs so it isn't lost when filtering. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="guildIds" value={id} />
      ))}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search guides by make / model / product…"
        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <label className="mt-1 flex cursor-pointer items-center gap-2 px-1 text-sm font-medium text-zinc-600">
        <input
          type="checkbox"
          checked={allShownSelected}
          ref={(el) => {
            if (el) el.indeterminate = someShownSelected && !allShownSelected;
          }}
          onChange={toggleAll}
        />
        {allShownSelected ? "Clear all" : "Select all"}
        {filtering ? " shown" : ""}
      </label>
      <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-zinc-200 p-2">
        {filtered.map((g) => (
          <label key={g.id} className="flex items-start gap-2 py-0.5 text-sm">
            <input
              type="checkbox"
              checked={selected.has(g.id)}
              onChange={() => toggle(g.id)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="font-medium">{g.title}</span>
              <span className="block text-xs text-zinc-400">{g.sub}</span>
            </span>
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-zinc-400">No guides match your search.</p>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        {filtered.length} of {guilds.length} shown · {selected.size} selected
      </p>
    </div>
  );
}
