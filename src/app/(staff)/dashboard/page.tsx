import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await currentUser();
  const [guildCount, publishedCount, activeGrants, newAlerts] =
    await Promise.all([
      prisma.guild.count(),
      prisma.guild.count({ where: { status: "PUBLISHED" } }),
      prisma.accessGrant.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      prisma.alert.count({ where: { status: "NEW" } }),
    ]);

  const cards = [
    { label: "Guilds", value: guildCount, href: "/guilds" },
    { label: "Published", value: publishedCount, href: "/guilds" },
    { label: "Active access links", value: activeGrants, href: "/grants" },
    {
      label: "New alerts",
      value: newAlerts,
      href: "/alerts",
      highlight: newAlerts > 0,
    },
  ];

  const recentGuilds = await prisma.guild.findMany({
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: {
      make: true,
      model: true,
      generation: true,
      iglaProduct: { include: { productLine: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          href="/guilds/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + New guild
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-xl border bg-white p-4 shadow-sm hover:shadow ${
              c.highlight ? "border-red-300 bg-red-50" : "border-zinc-200"
            }`}
          >
            <div className="text-3xl font-semibold">{c.value}</div>
            <div className="mt-1 text-sm text-zinc-500">{c.label}</div>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-medium">Recently updated guilds</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {recentGuilds.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            No guilds yet.{" "}
            {user?.role !== "INSTALLER" && (
              <Link className="underline" href="/guilds/new">
                Create the first one.
              </Link>
            )}
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recentGuilds.map((g) => (
                <tr key={g.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/guilds/${g.id}`} className="font-medium hover:underline">
                      {g.title}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {g.make.name} {g.model.name} {g.generation.name} ·{" "}
                      {g.iglaProduct.productLine.name} {g.iglaProduct.name}
                    </div>
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
