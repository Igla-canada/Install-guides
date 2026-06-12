import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function GuildsPage(props: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await props.searchParams;
  const guilds = await prisma.guild.findMany({
    where: {
      ...(status ? { status: status.toUpperCase() as never } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { make: { name: { contains: q, mode: "insensitive" } } },
              { model: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      make: true,
      model: true,
      generation: true,
      trim: true,
      iglaProduct: { include: { productLine: true } },
      updatedBy: true,
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Guilds</h1>
        <Link
          href="/guilds/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + New guild
        </Link>
      </div>

      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search make, model, title…"
          className="w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {guilds.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No guilds match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2">Guild</th>
                <th className="hidden px-4 py-2 sm:table-cell">Product</th>
                <th className="hidden px-4 py-2 md:table-cell">Updated</th>
                <th className="px-4 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {guilds.map((g) => (
                <tr key={g.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/guilds/${g.id}`} className="font-medium hover:underline">
                      {g.title}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {g.make.name} {g.model.name} {g.generation.name}
                      {g.trim ? ` · ${g.trim.name}` : ""}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-600 sm:table-cell">
                    {g.iglaProduct.productLine.name} {g.iglaProduct.name}
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-500 md:table-cell">
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
        )}
      </div>
    </div>
  );
}
