"use client";
// Per-installer guild access with a time frame. Each granted guild is either
// permanent or expires after one of the same durations as access links; a bulk
// control grants every guild at once with the same setting. The real selection
// rides in hidden inputs (like the access-link guild picker) so it submits to
// the server action cleanly.
import { useState } from "react";

type Guild = { id: string; title: string };
type Access = { guildId: string; expiresAt: number | null }; // epoch ms or null
type ExpiryOption = { label: string; hours: number };

// Non-duration choices. "perm" = never expires; "keep" = leave an existing
// grant's expiry untouched (so re-saving other rows doesn't reset its clock).
const PERM = "perm";
const KEEP = "keep";

function fmt(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function InstallerAccessForm({
  userId,
  guilds,
  access,
  allGuides: allGuidesInit,
  expiryOptions,
  action,
}: {
  userId: string;
  guilds: Guild[];
  access: Access[];
  allGuides: boolean;
  expiryOptions: ExpiryOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  // Captured once for the "expired" hint — render must stay pure.
  const [now] = useState(() => Date.now());
  // Blanket access to every published guide (old + future). When on, the
  // per-guide picker is irrelevant, so we collapse it.
  const [allGuides, setAllGuides] = useState(allGuidesInit);
  const current = new Map(access.map((a) => [a.guildId, a.expiresAt] as const));
  const granted = (id: string) => current.has(id);

  // Row state: checked + the chosen expiry value ("perm" | "keep" | hours).
  const [rows, setRows] = useState<Record<string, { checked: boolean; expiry: string }>>(
    () =>
      Object.fromEntries(
        guilds.map((g) => [
          g.id,
          {
            checked: granted(g.id),
            // Default granted rows to "keep" so a save elsewhere can't shorten
            // them; ungranted rows default to permanent.
            expiry: granted(g.id) ? KEEP : PERM,
          },
        ])
      )
  );
  const [bulk, setBulk] = useState<string>(PERM);

  const set = (id: string, patch: Partial<{ checked: boolean; expiry: string }>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const grantAll = () =>
    setRows(() =>
      Object.fromEntries(guilds.map((g) => [g.id, { checked: true, expiry: bulk }]))
    );
  const applyToChecked = () =>
    setRows((r) =>
      Object.fromEntries(
        Object.entries(r).map(([id, v]) => [id, v.checked ? { ...v, expiry: bulk } : v])
      )
    );
  const clearAll = () =>
    setRows((r) =>
      Object.fromEntries(Object.entries(r).map(([id, v]) => [id, { ...v, checked: false }]))
    );

  const status = (id: string) => {
    const exp = current.get(id);
    if (!granted(id)) return null;
    if (exp == null) return <span className="text-zinc-400">currently permanent</span>;
    if (exp <= now) return <span className="text-red-500">expired {fmt(exp)}</span>;
    return <span className="text-zinc-400">until {fmt(exp)}</span>;
  };

  const countChecked = Object.values(rows).filter((v) => v.checked).length;

  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="userId" value={userId} />
      {/* Hidden inputs carry the actual selection + per-guild expiry.
          Skipped entirely when "all guides" is on (the server ignores them). */}
      {!allGuides &&
        guilds
          .filter((g) => rows[g.id]?.checked)
          .map((g) => (
            <span key={g.id}>
              <input type="hidden" name="guildIds" value={g.id} />
              <input type="hidden" name={`expiry__${g.id}`} value={rows[g.id].expiry} />
            </span>
          ))}

      {/* All-guides blanket access. A native checkbox named "allGuides" submits
          "on" when checked (server treats that as: ignore the per-guild list and
          grant every published guide, including ones published later). */}
      <label className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 p-2 text-xs">
        <input
          type="checkbox"
          name="allGuides"
          checked={allGuides}
          onChange={(e) => setAllGuides(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-indigo-900">
            Access to ALL guides (including future ones)
          </span>
          <span className="block text-indigo-700/80">
            Permanent access to every published guide. New guides are included
            automatically — no need to re-grant.
          </span>
        </span>
      </label>

      {/* Bulk: grant everything (or everything checked) with one time frame. */}
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-md bg-zinc-50 p-2 text-xs ${
          allGuides ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <span className="font-medium text-zinc-600">Bulk:</span>
        <select
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          className="rounded border border-zinc-300 px-1.5 py-1"
        >
          <option value={PERM}>Permanent</option>
          {expiryOptions.map((o) => (
            <option key={o.hours} value={String(o.hours)}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={grantAll}
          className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100"
        >
          Grant all
        </button>
        <button
          type="button"
          onClick={applyToChecked}
          className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100"
        >
          Apply to checked
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100"
        >
          Clear all
        </button>
      </div>

      <div
        className={`max-h-56 space-y-1 overflow-y-auto rounded border border-zinc-200 p-2 ${
          allGuides ? "pointer-events-none opacity-40" : ""
        }`}
      >
        {guilds.map((g) => {
          const row = rows[g.id];
          return (
            <div key={g.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={row.checked}
                onChange={(e) => set(g.id, { checked: e.target.checked })}
              />
              <span className="min-w-0 flex-1 truncate" title={g.title}>
                {g.title}
                {status(g.id) && <span className="ml-1">· {status(g.id)}</span>}
              </span>
              <select
                value={row.expiry}
                disabled={!row.checked}
                onChange={(e) => set(g.id, { expiry: e.target.value })}
                className="rounded border border-zinc-300 px-1 py-0.5 disabled:opacity-40"
              >
                {granted(g.id) && (
                  <option value={KEEP}>
                    {current.get(g.id) == null
                      ? "Keep (permanent)"
                      : `Keep (until ${fmt(current.get(g.id)!)})`}
                  </option>
                )}
                <option value={PERM}>Permanent</option>
                {expiryOptions.map((o) => (
                  <option key={o.hours} value={String(o.hours)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        {guilds.length === 0 && (
          <p className="text-xs text-zinc-400">No published guides yet.</p>
        )}
      </div>

      <button className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700">
        {allGuides ? "Save access (all guides)" : `Save access (${countChecked})`}
      </button>
    </form>
  );
}
