"use client";

// Shared guide browser for admin (/guides) and installer (/my-guides).
// Staff: status tabs (incl. Archived), icons/list toggle, archive from list,
// floating peek preview. Installers: published guides only, simpler chrome.
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MakeLogo from "@/components/guides/make-logo";
import VehicleCascadeSearch from "@/components/vehicle-cascade-search";
import GuidePeekPanel, {
  type PeekGuide,
} from "@/components/guides/guide-peek-panel";
import { archiveGuide, restoreGuide } from "@/lib/guide-list-actions";
import { withFromParam } from "@/lib/guides-nav";

export type BrowserGuild = {
  id: string;
  title: string;
  status: string;
  /** When true, linked compatibility rows stay off dealer/API lists. */
  hideFromCompatibility?: boolean;
  updatedAt: Date | string;
  makeId: string;
  modelId: string;
  make: { id: string; name: string; logoUrl: string | null };
  model: { id: string; name: string };
  generation: { name: string; yearStart: number; yearEnd: number | null };
  trim: { name: string } | null;
  iglaProduct: { name: string; productLine: { name: string } };
  updatedBy?: { name: string } | null;
};

export type GuideBrowserSearch = {
  make?: string;
  year?: string;
  model?: string;
  q?: string;
  status?: string;
  view?: string;
};

const VIEW_KEY = "igla-guides-view";

function subtitle(g: BrowserGuild) {
  return [
    `${g.make.name} ${g.model.name}`,
    g.generation.name,
    g.trim?.name,
    `${g.iglaProduct.productLine.name} ${g.iglaProduct.name}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Stable across SSR/client (avoid toLocaleDateString hydration mismatches). */
function formatUpdated(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toISOString().slice(0, 10);
}

/** Make → model → year → title → product */
function compareGuides(a: BrowserGuild, b: BrowserGuild) {
  return (
    a.make.name.localeCompare(b.make.name) ||
    a.model.name.localeCompare(b.model.name) ||
    a.generation.yearStart - b.generation.yearStart ||
    a.title.localeCompare(b.title) ||
    a.iglaProduct.name.localeCompare(b.iglaProduct.name)
  );
}

function guideUrl(guideBasePath: string, id: string, from?: string) {
  const href = `${guideBasePath}/${id}`;
  return from ? `${href}?from=${encodeURIComponent(from)}` : href;
}

export function GuideBrowser({
  guilds: allGuilds,
  sp,
  basePath,
  title,
  /** Path prefix for opening a guide, e.g. `/guides` or `/view` (no function — client-safe). */
  guideBasePath,
  newGuide,
  statusTabs = false,
  showMeta = false,
  showStatusBadge = false,
}: {
  guilds: BrowserGuild[];
  sp: GuideBrowserSearch;
  basePath: string;
  title: string;
  guideBasePath: string;
  newGuide?: { href: string; label: string };
  statusTabs?: boolean;
  showMeta?: boolean;
  showStatusBadge?: boolean;
}) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const staffTools = statusTabs;

  // View mode stays client-side (localStorage). Do NOT router.push on toggle —
  // that remounted the page, made Icons/List feel dead, and flickered logos.
  const urlView =
    sp.view === "list" || sp.view === "icons" ? sp.view : null;
  const [view, setView] = useState<"icons" | "list">(urlView ?? "icons");
  const [viewReady, setViewReady] = useState(Boolean(urlView));
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});
  const [peek, setPeek] = useState<PeekGuide | null>(null);

  useEffect(() => {
    if (urlView) {
      setView(urlView);
      try {
        localStorage.setItem(VIEW_KEY, urlView);
      } catch {
        /* ignore */
      }
      setViewReady(true);
      return;
    }
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "list" || saved === "icons") setView(saved);
    } catch {
      /* ignore */
    }
    setViewReady(true);
  }, [urlView]);

  const statusFilter = statusTabs ? sp.status?.toUpperCase() : undefined;

  const guilds = useMemo(() => {
    const withLocal = allGuilds.map((g) =>
      localStatuses[g.id] ? { ...g, status: localStatuses[g.id]! } : g,
    );
    if (statusFilter === "ARCHIVED") {
      return withLocal.filter((g) => g.status === "ARCHIVED");
    }
    if (statusFilter === "PUBLISHED" || statusFilter === "DRAFT") {
      return withLocal.filter((g) => g.status === statusFilter);
    }
    // "All" hides archived backups
    return withLocal.filter((g) => g.status !== "ARCHIVED");
  }, [allGuilds, localStatuses, statusFilter]);

  const statusCounts = useMemo(() => {
    let published = 0;
    let draft = 0;
    let archived = 0;
    for (const g of allGuilds) {
      const s = localStatuses[g.id] ?? g.status;
      if (s === "PUBLISHED") published++;
      else if (s === "DRAFT") draft++;
      else if (s === "ARCHIVED") archived++;
    }
    return {
      published,
      draft,
      archived,
      all: published + draft, // "All" tab excludes archived
    };
  }, [allGuilds, localStatuses]);

  const noneMsg = statusFilter
    ? `No ${statusFilter.toLowerCase()} guides for this selection.`
    : null;

  const drill = (o: { make?: string; year?: number; model?: string }) => {
    const p = new URLSearchParams();
    if (o.make) p.set("make", o.make);
    if (o.year) p.set("year", String(o.year));
    if (o.model) p.set("model", o.model);
    if (statusFilter) p.set("status", statusFilter);
    if (view === "list") p.set("view", "list");
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const covers = (g: BrowserGuild, year: number) =>
    g.generation.yearStart <= year &&
    year <= (g.generation.yearEnd ?? currentYear + 1);

  const buildHref = (opts?: {
    status?: string;
    view?: "icons" | "list";
    clearStatus?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (sp.make) params.set("make", sp.make);
    if (sp.year) params.set("year", sp.year);
    if (sp.model) params.set("model", sp.model);
    if (sp.q) params.set("q", sp.q);
    const st = opts?.clearStatus
      ? undefined
      : opts?.status !== undefined
        ? opts.status
        : statusFilter;
    if (st) params.set("status", st);
    const v = opts?.view ?? view;
    if (v === "list") params.set("view", "list");
    else if (sp.view === "icons" || opts?.view === "icons")
      params.set("view", "icons");
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  function setViewMode(next: "icons" | "list") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
    // Soft-update the query string without a Next navigation / RSC refetch.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "list") url.searchParams.set("view", "list");
      else url.searchParams.delete("view");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }

  const makeOpts: Array<{ value: string; label: string }> = [];
  const modelsByMake: Record<string, Array<{ value: string; label: string }>> =
    {};
  {
    const makes = new Map<string, string>();
    const models = new Map<string, Map<string, string>>();
    for (const g of guilds) {
      makes.set(g.makeId, g.make.name);
      let mm = models.get(g.makeId);
      if (!mm) {
        mm = new Map();
        models.set(g.makeId, mm);
      }
      mm.set(g.modelId, g.model.name);
    }
    for (const [id, name] of [...makes.entries()].sort((a, b) =>
      a[1].localeCompare(b[1]),
    )) {
      makeOpts.push({ value: id, label: name });
      modelsByMake[id] = [...(models.get(id)?.entries() ?? [])]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
  }

  const yearOptions = (() => {
    const set = new Set<number>([currentYear, currentYear + 1]);
    for (const g of guilds) {
      const from = g.generation.yearStart;
      const to = Math.min(
        g.generation.yearEnd ?? currentYear + 1,
        currentYear + 1,
      );
      for (let y = from; y <= to; y++) {
        if (y >= 1990 && y <= currentYear + 2) set.add(y);
      }
    }
    return [...set].sort((a, b) => b - a);
  })();

  const make = sp.make
    ? allGuilds.find((g) => g.makeId === sp.make)?.make
    : undefined;
  const year = sp.year ? parseInt(sp.year, 10) : undefined;
  const yearOk = year != null && !Number.isNaN(year);
  const model = sp.model
    ? allGuilds.find((g) => g.modelId === sp.model)?.model
    : undefined;

  const filteredHits = useMemo(() => {
    let hits = guilds;
    if (sp.q) {
      const q = sp.q.toLowerCase();
      hits = hits.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.make.name.toLowerCase().includes(q) ||
          g.model.name.toLowerCase().includes(q),
      );
    }
    if (sp.make) hits = hits.filter((g) => g.makeId === sp.make);
    if (sp.model) hits = hits.filter((g) => g.modelId === sp.model);
    if (yearOk) hits = hits.filter((g) => covers(g, year!));
    return [...hits].sort(compareGuides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guilds, sp.q, sp.make, sp.model, yearOk, year]);

  const alphabetizedGuilds = useMemo(
    () => [...guilds].sort(compareGuides),
    [guilds],
  );

  const hasDrill = Boolean(sp.make || sp.model || yearOk || sp.q);
  const backTo = buildHref();

  const tabs = statusTabs ? (
    <div className="mt-4 inline-flex flex-wrap rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
      {(
        [
          ["All", "", statusCounts.all],
          ["Published", "PUBLISHED", statusCounts.published],
          ["Draft", "DRAFT", statusCounts.draft],
          ["Archived", "ARCHIVED", statusCounts.archived],
        ] as const
      ).map(([label, value, count]) => {
        const active = (statusFilter ?? "") === value;
        return (
          <Link
            key={value || "all"}
            href={buildHref({
              status: value || undefined,
              clearStatus: !value,
            })}
            className={`rounded-md px-3 py-1 ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {label}
            <span className="ml-1 tabular-nums opacity-70">{count}</span>
          </Link>
        );
      })}
    </div>
  ) : null;

  const viewToggle = (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setViewMode("icons")}
        className={`rounded-md px-2.5 py-1.5 ${
          view === "icons"
            ? "bg-zinc-900 text-white"
            : "text-zinc-600 hover:bg-zinc-100"
        }`}
        title="Icon tiles"
      >
        Icons
      </button>
      <button
        type="button"
        onClick={() => setViewMode("list")}
        className={`rounded-md px-2.5 py-1.5 ${
          view === "list"
            ? "bg-zinc-900 text-white"
            : "text-zinc-600 hover:bg-zinc-100"
        }`}
        title="Compact list"
      >
        List
      </button>
    </div>
  );

  function openPeek(g: BrowserGuild) {
    if (!staffTools) return;
    setPeek({
      id: g.id,
      title: g.title,
      status: g.status,
      hideFromCompatibility: Boolean(g.hideFromCompatibility),
      subtitle: subtitle(g),
    });
  }

  const crumbs =
    make || model || yearOk ? (
      <nav className="mt-3 flex flex-wrap items-center gap-1 text-sm">
        <Link
          href={drill({})}
          className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100"
        >
          All makes
        </Link>
        {make && (
          <>
            <span className="text-zinc-300">/</span>
            <Link
              href={drill({ make: make.id })}
              className={`rounded-md px-2 py-1 ${
                !model && !yearOk
                  ? "font-semibold"
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {make.name}
            </Link>
          </>
        )}
        {make && model && (
          <>
            <span className="text-zinc-300">/</span>
            <Link
              href={drill({ make: make.id, model: model.id })}
              className={`rounded-md px-2 py-1 ${
                !yearOk ? "font-semibold" : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {model.name}
            </Link>
          </>
        )}
        {yearOk && (
          <>
            <span className="text-zinc-300">/</span>
            <span className="rounded-md px-2 py-1 font-semibold">{year}</span>
          </>
        )}
      </nav>
    ) : null;

  // Manufacturer tiles (icons mode, no filter)
  const byMake = new Map<
    string,
    { name: string; logoUrl: string | null; count: number; models: Set<string> }
  >();
  for (const g of guilds) {
    const m =
      byMake.get(g.makeId) ??
      {
        name: g.make.name,
        logoUrl: g.make.logoUrl,
        count: 0,
        models: new Set<string>(),
      };
    m.count++;
    m.models.add(g.modelId);
    byMake.set(g.makeId, m);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {viewToggle}
          <form method="get" action={basePath}>
            {statusFilter && (
              <input type="hidden" name="status" value={statusFilter} />
            )}
            {view === "list" && <input type="hidden" name="view" value="list" />}
            {sp.make && <input type="hidden" name="make" value={sp.make} />}
            {sp.model && <input type="hidden" name="model" value={sp.model} />}
            {sp.year && <input type="hidden" name="year" value={sp.year} />}
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search title…"
              className="w-44 rounded-md border border-zinc-300 px-3 py-1.5 text-sm sm:w-56"
            />
          </form>
          {newGuide && (
            <Link
              href={newGuide.href}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              {newGuide.label}
            </Link>
          )}
        </div>
      </div>
      {tabs}
      <div className="mt-4">
        <VehicleCascadeSearch
          makes={makeOpts}
          modelsByMake={modelsByMake}
          yearOptions={yearOptions}
          initial={{ make: sp.make, model: sp.model, year: sp.year }}
          actionPath={basePath}
          extraParams={{
            status: statusFilter || undefined,
            view: view === "list" ? "list" : undefined,
          }}
        />
      </div>
      {sp.q ? (
        <p className="mt-3 text-sm text-zinc-500">
          Results for “{sp.q}” —{" "}
          <Link href={buildHref()} className="underline">
            clear text search
          </Link>
        </p>
      ) : (
        crumbs
      )}

      <div className="mt-4 min-h-[12rem]">
        {!viewReady ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-16 text-center text-sm text-zinc-400">
            Loading…
          </div>
        ) : !hasDrill && view === "icons" ? (
          <TileGrid
            items={[...byMake.entries()]
              .sort((a, b) => a[1].name.localeCompare(b[1].name))
              .map(([id, m]) => ({
                href: drill({ make: id }),
                title: m.name,
                sub: `${m.models.size} model${m.models.size === 1 ? "" : "s"} · ${m.count} guide${
                  m.count === 1 ? "" : "s"
                }`,
                logo: { name: m.name, logoUrl: m.logoUrl },
              }))}
            empty={noneMsg ?? "No guides yet."}
          />
        ) : !hasDrill && view === "list" ? (
          <GuildTable
            guilds={alphabetizedGuilds}
            guideBasePath={guideBasePath}
            showMeta={showMeta}
            showStatusBadge={showStatusBadge}
            staffTools={staffTools}
            empty={noneMsg ?? "No guides yet."}
            backTo={backTo}
            onOpen={staffTools ? openPeek : undefined}
            onStatusChange={(id, status) =>
              setLocalStatuses((s) => ({ ...s, [id]: status }))
            }
          />
        ) : view === "icons" && hasDrill ? (
          <GuideCardGrid
            guilds={filteredHits}
            empty={noneMsg ?? "No guides match this search."}
            onOpen={
              staffTools
                ? openPeek
                : (g) => {
                    router.push(guideUrl(guideBasePath, g.id, backTo));
                  }
            }
            showStatusBadge={showStatusBadge}
          />
        ) : (
          <GuildTable
            guilds={filteredHits}
            guideBasePath={guideBasePath}
            showMeta={showMeta}
            showStatusBadge={showStatusBadge}
            staffTools={staffTools}
            empty={noneMsg ?? "No guides match this search."}
            backTo={backTo}
            onOpen={staffTools ? openPeek : undefined}
            onStatusChange={(id, status) =>
              setLocalStatuses((s) => ({ ...s, [id]: status }))
            }
          />
        )}
      </div>

      {peek && (
        <GuidePeekPanel
          guide={peek}
          onClose={() => setPeek(null)}
          onStatusChange={(id, status) => {
            setLocalStatuses((s) => ({ ...s, [id]: status }));
            setPeek((p) => (p && p.id === id ? { ...p, status } : p));
          }}
          onHideFromCompatibilityChange={(id, hidden) => {
            setPeek((p) =>
              p && p.id === id ? { ...p, hideFromCompatibility: hidden } : p,
            );
          }}
          fullHref={guideUrl(guideBasePath, peek.id, backTo)}
          editHref={withFromParam(`/guides/${peek.id}/edit`, backTo)}
        />
      )}
    </div>
  );
}

function TileGrid({
  items,
  empty,
}: {
  items: Array<{
    href: string;
    title: string;
    sub: string;
    logo?: { name: string; logoUrl: string | null };
  }>;
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
        {empty}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400 hover:shadow"
        >
          {it.logo ? (
            <div className="flex items-center gap-3">
              <MakeLogo name={it.logo.name} logoUrl={it.logo.logoUrl} size={44} />
              <div className="min-w-0">
                <div className="truncate text-xl font-semibold">{it.title}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{it.sub}</div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xl font-semibold">{it.title}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{it.sub}</div>
            </>
          )}
        </Link>
      ))}
    </div>
  );
}

function GuideCardGrid({
  guilds,
  empty,
  onOpen,
  showStatusBadge,
}: {
  guilds: BrowserGuild[];
  empty: string;
  onOpen: (g: BrowserGuild) => void;
  showStatusBadge: boolean;
}) {
  if (guilds.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
        {empty}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {guilds.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onOpen(g)}
          className="rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-400 hover:shadow"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 font-medium text-zinc-900">{g.title}</div>
            {showStatusBadge && <StatusBadge status={g.status} />}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{subtitle(g)}</div>
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
        status === "PUBLISHED"
          ? "bg-green-100 text-green-800"
          : status === "DRAFT"
            ? "bg-amber-100 text-amber-800"
            : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function GuildTable({
  guilds,
  guideBasePath,
  showMeta,
  showStatusBadge,
  staffTools,
  empty = "No guides here.",
  backTo,
  onOpen,
  onStatusChange,
}: {
  guilds: BrowserGuild[];
  guideBasePath: string;
  showMeta: boolean;
  showStatusBadge: boolean;
  staffTools: boolean;
  empty?: string;
  backTo?: string;
  onOpen?: (g: BrowserGuild) => void;
  onStatusChange?: (id: string, status: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (guilds.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
        {empty}
      </p>
    );
  }

  function toggleArchive(g: BrowserGuild, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setPendingId(g.id);
    startTransition(async () => {
      const res =
        g.status === "ARCHIVED"
          ? await restoreGuide(g.id)
          : await archiveGuide(g.id);
      if (res.ok && res.status) onStatusChange?.(g.id, res.status);
      setPendingId(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <tbody>
          {guilds.map((g) => (
            <tr
              key={g.id}
              className={`border-b border-zinc-100 last:border-0 hover:bg-zinc-50 ${
                onOpen ? "cursor-pointer" : ""
              }`}
              onClick={onOpen ? () => onOpen(g) : undefined}
            >
              <td className="px-4 py-3">
                {onOpen ? (
                  <span className="font-medium hover:underline">{g.title}</span>
                ) : (
                  <Link
                    href={guideUrl(guideBasePath, g.id, backTo)}
                    className="font-medium hover:underline"
                  >
                    {g.title}
                  </Link>
                )}
                <div className="text-xs text-zinc-500">{subtitle(g)}</div>
              </td>
              {showMeta && (
                <td className="hidden px-4 py-3 text-xs text-zinc-400 md:table-cell">
                  {formatUpdated(g.updatedAt)}
                  {g.updatedBy ? ` · ${g.updatedBy.name}` : ""}
                </td>
              )}
              {showStatusBadge && (
                <td className="px-3 py-3 text-right">
                  <StatusBadge status={g.status} />
                </td>
              )}
              {staffTools && (
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    disabled={pendingId === g.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleArchive(g, e);
                    }}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                    title={
                      g.status === "ARCHIVED"
                        ? "Restore to draft"
                        : "Archive — hide but keep as backup"
                    }
                  >
                    {g.status === "ARCHIVED" ? "Restore" : "Archive"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
