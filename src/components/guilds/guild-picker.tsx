"use client";
// Searchable multi-select of published guides for the access-link form. Renders
// plain `guildIds` checkboxes inside the surrounding <form>, so it works with
// the server action unchanged — it just adds a filter box for scale.
import { useMemo, useState } from "react";

type PickGuild = { id: string; title: string; sub: string };

export default function GuildPicker({ guilds }: { guilds: PickGuild[] }) {
  const [query, setQuery] = useState("");
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

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search guides by make / model / product…"
        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-zinc-200 p-2">
        {filtered.map((g) => (
          <label key={g.id} className="flex items-start gap-2 py-0.5 text-sm">
            <input type="checkbox" name="guildIds" value={g.id} className="mt-1" />
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
        {filtered.length} of {guilds.length} shown
      </p>
    </div>
  );
}
