// Guide library — hierarchical browsing, not a flat dump:
// manufacturers → years → models available that year → the guides themselves.
// Search (?q=) falls back to a flat filtered table.
import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function GuildsPage(props: {
  searchParams: Promise<{ make?: string; year?: string; model?: string; q?: string; status?: string }>;
}) {
  const sp = await props.searchParams;
  const currentYear = new Date().getFullYear();

  const guilds = await prisma.guild.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      make: true,
      model: true,
      generation: true,
      trim: true,
      iglaProduct: { include: { productLine: true } },
      updatedBy: { select: { name: true } },
    },
  });

  const covers = (g: (typeof guilds)[number], year: number) =>
    g.generation.yearStart <= year && year <= (g.generation.yearEnd ?? currentYear + 1);

  // ---- Search → flat table -------------------------------------------------
  if (sp.q) {
    const q = sp.q.toLowerCase();
    const hits = guilds.filter(
      (g) =>
        (!sp.status || g.status === sp.status.toUpperCase()) &&
        (g.title.toLowerCase().includes(q) ||
          g.make.name.toLowerCase().includes(q) ||
          g.model.name.toLowerCase().includes(q))
    );
    return (
      <Shell q={sp.q}>
        <GuildTable guilds={hits} />
      </Shell>
    );
  }

  const make = sp.make ? guilds.find((g) => g.makeId === sp.make)?.make : undefined;
  const year = sp.year ? parseInt(sp.year, 10) : undefined;
  const model = sp.model ? guilds.find((g) => g.modelId === sp.model)?.model : undefined;

  const crumbs = (
    <nav className="mt-4 flex flex-wrap items-center gap-1 text-sm">
      <Link href="/guilds" className={`rounded-md px-2 py-1 ${!make ? "font-semibold" : "text-zinc-500 hover:bg-zinc-100"}`}>
        All makes
      </Link>
      {make && (
        <>
          <span className="text-zinc-300">/</span>
          <Link
            href={`/guilds?make=${make.id}`}
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
            href={`/guilds?make=${make.id}&year=${year}`}
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
    return (
      <Shell crumbs={crumbs}>
        <GuildTable guilds={hits} />
      </Shell>
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
    return (
      <Shell crumbs={crumbs}>
        <TileGrid
          items={[...byModel.entries()]
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([id, m]) => ({
              href: `/guilds?make=${make.id}&year=${year}&model=${id}`,
              title: m.name,
              sub: `${m.count} guide${m.count === 1 ? "" : "s"}${
                m.published < m.count ? ` · ${m.published} published` : ""
              }`,
            }))}
          empty={`No models with guides covering ${year}.`}
        />
      </Shell>
    );
  }

  // ---- Level 2: years covered by this make's guides --------------------------
  if (make) {
    const yearSet = new Map<number, number>(); // year -> guide count
    for (const g of guilds) {
      if (g.makeId !== make.id) continue;
      const from = g.generation.yearStart;
      const to = Math.min(g.generation.yearEnd ?? currentYear + 1, currentYear + 1);
      for (let y = from; y <= to; y++) {
        yearSet.set(y, (yearSet.get(y) ?? 0) + 1);
      }
    }
    return (
      <Shell crumbs={crumbs}>
        <TileGrid
          small
          items={[...yearSet.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([y, count]) => ({
              href: `/guilds?make=${make.id}&year=${y}`,
              title: String(y),
              sub: `${count} guide${count === 1 ? "" : "s"}`,
            }))}
          empty="No guides for this make yet."
        />
      </Shell>
    );
  }

  // ---- Level 1: manufacturers -------------------------------------------------
  const byMake = new Map<string, { name: string; count: number; models: Set<string> }>();
  for (const g of guilds) {
    const m = byMake.get(g.makeId) ?? { name: g.make.name, count: 0, models: new Set() };
    m.count++;
    m.models.add(g.modelId);
    byMake.set(g.makeId, m);
  }
  return (
    <Shell crumbs={crumbs}>
      <TileGrid
        items={[...byMake.entries()]
          .sort((a, b) => a[1].name.localeCompare(b[1].name))
          .map(([id, m]) => ({
            href: `/guilds?make=${id}`,
            title: m.name,
            sub: `${m.models.size} model${m.models.size === 1 ? "" : "s"} · ${m.count} guide${
              m.count === 1 ? "" : "s"
            }`,
          }))}
        empty="No guides yet — create the first one."
      />
    </Shell>
  );
}

function Shell({
  children,
  crumbs,
  q,
}: {
  children: React.ReactNode;
  crumbs?: React.ReactNode;
  q?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Guides</h1>
        <div className="flex items-center gap-2">
          <form method="get">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search any guide…"
              className="w-56 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
          </form>
          <Link
            href="/guilds/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            + New guide
          </Link>
        </div>
      </div>
      {q ? (
        <p className="mt-4 text-sm text-zinc-500">
          Results for “{q}” —{" "}
          <Link href="/guilds" className="underline">
            back to browsing
          </Link>
        </p>
      ) : (
        crumbs
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function TileGrid({
  items,
  empty,
  small = false,
}: {
  items: Array<{ href: string; title: string; sub: string }>;
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
          <div className={small ? "text-lg font-semibold" : "text-xl font-semibold"}>
            {it.title}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{it.sub}</div>
        </Link>
      ))}
    </div>
  );
}

function GuildTable({
  guilds,
}: {
  guilds: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: Date;
    make: { name: string };
    model: { name: string };
    generation: { name: string };
    trim: { name: string } | null;
    iglaProduct: { name: string; productLine: { name: string } };
    updatedBy: { name: string };
  }>;
}) {
  if (guilds.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
        No guides here.
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
                <Link href={`/guilds/${g.id}`} className="font-medium hover:underline">
                  {g.title}
                </Link>
                <div className="text-xs text-zinc-500">
                  {g.make.name} {g.model.name} {g.generation.name}
                  {g.trim ? ` · ${g.trim.name}` : ""} · {g.iglaProduct.productLine.name}{" "}
                  {g.iglaProduct.name}
                </div>
              </td>
              <td className="hidden px-4 py-3 text-xs text-zinc-400 md:table-cell">
                {g.updatedAt.toLocaleDateString()} · {g.updatedBy.name}
              </td>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
