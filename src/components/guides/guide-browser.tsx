// Shared hierarchical guide browser used by BOTH the admin library (/guides)
// and the installer home (/my-guilds), so the two look identical. Drill-down:
// manufacturers → years → models available that year → the guides themselves;
// search (?q=) falls back to a flat filtered table.
//
// Callers differ only in: which guilds they pass (admin = all; installer =
// published guilds assigned to them), where a guide row links (admin = the
// editor surface, installer = the view-only page), and whether the staff-only
// chrome (status tabs, "+ New guide", editor metadata) is shown.
import Link from "next/link";
import MakeLogo from "@/components/guides/make-logo";

export type BrowserGuild = {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
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
};

export function GuideBrowser({
  guilds: allGuilds,
  sp,
  basePath,
  title,
  guideHref,
  newGuide,
  statusTabs = false,
  showMeta = false,
  showStatusBadge = false,
}: {
  guilds: BrowserGuild[];
  sp: GuideBrowserSearch;
  basePath: string;
  title: string;
  guideHref: (id: string) => string;
  newGuide?: { href: string; label: string };
  statusTabs?: boolean;
  showMeta?: boolean;
  showStatusBadge?: boolean;
}) {
  const currentYear = new Date().getFullYear();

  // Status tabs (All / Published / Draft) are staff-only; installers always see
  // their pre-filtered published set.
  const statusFilter = statusTabs ? sp.status?.toUpperCase() : undefined;
  const guilds =
    statusFilter === "PUBLISHED" || statusFilter === "DRAFT"
      ? allGuilds.filter((g) => g.status === statusFilter)
      : allGuilds;
  const noneMsg = statusFilter
    ? `No ${statusFilter.toLowerCase()} guides for this selection.`
    : null;

  const drill = (o: { make?: string; year?: number; model?: string }) => {
    const p = new URLSearchParams();
    if (o.make) p.set("make", o.make);
    if (o.year) p.set("year", String(o.year));
    if (o.model) p.set("model", o.model);
    if (statusFilter) p.set("status", statusFilter);
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const covers = (g: BrowserGuild, year: number) =>
    g.generation.yearStart <= year && year <= (g.generation.yearEnd ?? currentYear + 1);

  const buildHref = (status?: string) => {
    const params = new URLSearchParams();
    if (sp.make) params.set("make", sp.make);
    if (sp.year) params.set("year", sp.year);
    if (sp.model) params.set("model", sp.model);
    if (sp.q) params.set("q", sp.q);
    if (status) params.set("status", status);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };
  const tabs = statusTabs ? (
    <div className="mt-4 inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
      {(
        [
          ["All", ""],
          ["Published", "PUBLISHED"],
          ["Draft", "DRAFT"],
        ] as const
      ).map(([label, value]) => {
        const active = (statusFilter ?? "") === value;
        return (
          <Link
            key={value}
            href={buildHref(value || undefined)}
            className={`rounded-md px-3 py-1 ${
              active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  ) : undefined;

  const shell = (children: React.ReactNode, crumbs?: React.ReactNode) => (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          <form method="get" action={basePath}>
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search any guide…"
              className="w-56 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
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
      {sp.q ? (
        <p className="mt-4 text-sm text-zinc-500">
          Results for “{sp.q}” —{" "}
          <Link href={basePath} className="underline">
            back to browsing
          </Link>
        </p>
      ) : (
        crumbs
      )}
      <div className="mt-4">{children}</div>
    </div>
  );

  // ---- Search → flat table -------------------------------------------------
  if (sp.q) {
    const q = sp.q.toLowerCase();
    const hits = guilds.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.make.name.toLowerCase().includes(q) ||
        g.model.name.toLowerCase().includes(q)
    );
    return shell(
      <GuildTable
        guilds={hits}
        guideHref={guideHref}
        showMeta={showMeta}
        showStatusBadge={showStatusBadge}
        empty={noneMsg ?? undefined}
      />
    );
  }

  // Resolve identity from the FULL set so breadcrumbs stay correct even when a
  // status tab filters the listing to empty.
  const make = sp.make ? allGuilds.find((g) => g.makeId === sp.make)?.make : undefined;
  const year = sp.year ? parseInt(sp.year, 10) : undefined;
  const model = sp.model ? allGuilds.find((g) => g.modelId === sp.model)?.model : undefined;

  const crumbs = (
    <nav className="mt-4 flex flex-wrap items-center gap-1 text-sm">
      <Link href={drill({})} className={`rounded-md px-2 py-1 ${!make ? "font-semibold" : "text-zinc-500 hover:bg-zinc-100"}`}>
        All makes
      </Link>
      {make && (
        <>
          <span className="text-zinc-300">/</span>
          <Link
            href={drill({ make: make.id })}
            className={`rounded-md px-2 py-1 ${!year ? "font-semibold" : "text-zinc-500 hover:bg-zinc-100"}`}
          >
            {make.name}
          </Link>
        </>
      )}
      {make && year && (
        <>
          <span className="text-zinc-300">/</span>
          <Link
            href={drill({ make: make.id, year })}
            className={`rounded-md px-2 py-1 ${!model ? "font-semibold" : "text-zinc-500 hover:bg-zinc-100"}`}
          >
            {year}
          </Link>
        </>
      )}
      {make && year && model && (
        <>
          <span className="text-zinc-300">/</span>
          <span className="rounded-md px-2 py-1 font-semibold">{model.name}</span>
        </>
      )}
    </nav>
  );

  // ---- Level 4: guides for make + year + model ------------------------------
  if (make && year && model) {
    const hits = guilds.filter(
      (g) => g.makeId === make.id && g.modelId === model.id && covers(g, year)
    );
    return shell(
      <GuildTable
        guilds={hits}
        guideHref={guideHref}
        showMeta={showMeta}
        showStatusBadge={showStatusBadge}
        empty={noneMsg ?? undefined}
      />,
      crumbs
    );
  }

  // ---- Level 3: models available for that make + year -----------------------
  if (make && year) {
    const byModel = new Map<string, { name: string; count: number; published: number }>();
    for (const g of guilds) {
      if (g.makeId !== make.id || !covers(g, year)) continue;
      const m = byModel.get(g.modelId) ?? { name: g.model.name, count: 0, published: 0 };
      m.count++;
      if (g.status === "PUBLISHED") m.published++;
      byModel.set(g.modelId, m);
    }
    return shell(
      <TileGrid
        items={[...byModel.entries()]
          .sort((a, b) => a[1].name.localeCompare(b[1].name))
          .map(([id, m]) => ({
            href: drill({ make: make.id, year, model: id }),
            title: m.name,
            sub: `${m.count} guide${m.count === 1 ? "" : "s"}${
              showStatusBadge && m.published < m.count ? ` · ${m.published} published` : ""
            }`,
          }))}
        empty={noneMsg ?? `No models with guides covering ${year}.`}
      />,
      crumbs
    );
  }

  // ---- Level 2: years covered by this make's guides --------------------------
  if (make) {
    const yearSet = new Map<number, number>();
    for (const g of guilds) {
      if (g.makeId !== make.id) continue;
      const from = g.generation.yearStart;
      const to = Math.min(g.generation.yearEnd ?? currentYear + 1, currentYear + 1);
      for (let y = from; y <= to; y++) {
        yearSet.set(y, (yearSet.get(y) ?? 0) + 1);
      }
    }
    return shell(
      <TileGrid
        small
        items={[...yearSet.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([y, count]) => ({
            href: drill({ make: make.id, year: y }),
            title: String(y),
            sub: `${count} guide${count === 1 ? "" : "s"}`,
          }))}
        empty={noneMsg ?? "No guides for this make yet."}
      />,
      crumbs
    );
  }

  // ---- Level 1: manufacturers -------------------------------------------------
  const byMake = new Map<
    string,
    { name: string; logoUrl: string | null; count: number; models: Set<string> }
  >();
  for (const g of guilds) {
    const m =
      byMake.get(g.makeId) ??
      { name: g.make.name, logoUrl: g.make.logoUrl, count: 0, models: new Set<string>() };
    m.count++;
    m.models.add(g.modelId);
    byMake.set(g.makeId, m);
  }
  return shell(
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
    />,
    crumbs
  );
}

function TileGrid({
  items,
  empty,
  small = false,
}: {
  items: Array<{
    href: string;
    title: string;
    sub: string;
    logo?: { name: string; logoUrl: string | null };
  }>;
  empty: string;
  small?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
        {empty}
      </p>
    );
  }
  return (
    <div
      className={`grid gap-3 ${
        small
          ? "grid-cols-3 sm:grid-cols-5 lg:grid-cols-7"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      }`}
    >
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
              <div className={small ? "text-lg font-semibold" : "text-xl font-semibold"}>
                {it.title}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">{it.sub}</div>
            </>
          )}
        </Link>
      ))}
    </div>
  );
}

function GuildTable({
  guilds,
  guideHref,
  showMeta,
  showStatusBadge,
  empty = "No guides here.",
}: {
  guilds: BrowserGuild[];
  guideHref: (id: string) => string;
  showMeta: boolean;
  showStatusBadge: boolean;
  empty?: string;
}) {
  if (guilds.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <tbody>
          {guilds.map((g) => (
            <tr key={g.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
              <td className="px-4 py-3">
                <Link href={guideHref(g.id)} className="font-medium hover:underline">
                  {g.title}
                </Link>
                <div className="text-xs text-zinc-500">
                  {g.make.name} {g.model.name} {g.generation.name}
                  {g.trim ? ` · ${g.trim.name}` : ""} · {g.iglaProduct.productLine.name}{" "}
                  {g.iglaProduct.name}
                </div>
              </td>
              {showMeta && (
                <td className="hidden px-4 py-3 text-xs text-zinc-400 md:table-cell">
                  {g.updatedAt.toLocaleDateString()}
                  {g.updatedBy ? ` · ${g.updatedBy.name}` : ""}
                </td>
              )}
              {showStatusBadge && (
                <td className="px-4 py-3 text-right">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      g.status === "PUBLISHED"
                        ? "bg-green-100 text-green-800"
                        : g.status === "DRAFT"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {g.status.toLowerCase()}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
