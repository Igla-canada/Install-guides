// System usage at a glance — the guide library itself lives under /guilds.
import Link from "next/link";
import { prisma } from "@/lib/db";

const DAY = 86_400_000;

export default async function DashboardPage() {
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY);
  const since30 = new Date(now - 30 * DAY);
  const since14 = new Date(now - 14 * DAY);

  const [
    publishedCount,
    draftCount,
    views7,
    resolves30,
    activeGrants,
    newAlerts,
    viewEvents14,
    topViewRows,
    recentEvents,
  ] = await Promise.all([
    prisma.guild.count({ where: { status: "PUBLISHED" } }),
    prisma.guild.count({ where: { status: "DRAFT" } }),
    prisma.auditEvent.count({ where: { action: "view", ts: { gte: since7 } } }),
    prisma.auditEvent.count({ where: { action: "resolve", ts: { gte: since30 } } }),
    prisma.accessGrant.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    prisma.alert.count({ where: { status: "NEW" } }),
    prisma.auditEvent.findMany({
      where: { action: "view", ts: { gte: since14 } },
      select: { ts: true },
    }),
    prisma.auditEvent.groupBy({
      by: ["guildId"],
      where: { action: "view", ts: { gte: since30 }, guildId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { guildId: "desc" } },
      take: 5,
    }),
    prisma.auditEvent.findMany({
      orderBy: { ts: "desc" },
      take: 12,
      include: {
        user: { select: { name: true } },
        grant: { select: { granteeLabel: true } },
        guild: { select: { title: true } },
      },
    }),
  ]);

  // Views per day, last 14 days (oldest → newest).
  const days: Array<{ label: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(now - i * DAY);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + DAY;
    days.push({
      label: dayStart.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      count: viewEvents14.filter(
        (e) => e.ts.getTime() >= dayStart.getTime() && e.ts.getTime() < dayEnd
      ).length,
    });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  const topGuilds = await prisma.guild.findMany({
    where: { id: { in: topViewRows.map((r) => r.guildId!) } },
    select: { id: true, title: true },
  });

  const cards = [
    { label: "Published guides", value: publishedCount, href: "/guilds" },
    { label: "Drafts in progress", value: draftCount, href: "/guilds?status=draft" },
    { label: "Views · last 7 days", value: views7, href: "/audit?action=view" },
    { label: "App lookups · 30 days", value: resolves30, href: "/audit?action=resolve" },
    { label: "Active access links", value: activeGrants, href: "/grants" },
    {
      label: "New alerts",
      value: newAlerts,
      href: "/alerts",
      highlight: newAlerts > 0,
    },
  ];

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

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-xl border bg-white p-4 shadow-sm hover:shadow ${
              c.highlight ? "border-red-300 bg-red-50" : "border-zinc-200"
            }`}
          >
            <div className="text-3xl font-semibold">{c.value}</div>
            <div className="mt-1 text-xs text-zinc-500">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Views per day */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Guide views — last 14 days</h2>
          <div className="mt-4 flex h-32 items-end gap-1">
            {days.map((d, i) => (
              <div key={i} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-blue-500/80 transition-colors group-hover:bg-blue-600"
                  style={{ height: `${Math.max(2, (d.count / maxDay) * 120)}px` }}
                />
                <div className="absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-white group-hover:block">
                  {d.count}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-zinc-400">
            <span>{days[0].label}</span>
            <span>{days[days.length - 1].label}</span>
          </div>
        </div>

        {/* Most viewed */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Most viewed — last 30 days</h2>
          {topViewRows.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">No installer views yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {topViewRows.map((r) => {
                const g = topGuilds.find((x) => x.id === r.guildId);
                const max = topViewRows[0]._count._all;
                return (
                  <li key={r.guildId}>
                    <Link href={`/guilds/${r.guildId}`} className="block">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium hover:underline">
                          {g?.title ?? "(deleted guide)"}
                        </span>
                        <span className="ml-2 shrink-0 text-zinc-500">
                          {r._count._all} views
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded bg-zinc-100">
                        <div
                          className="h-1.5 rounded bg-green-500"
                          style={{ width: `${(r._count._all / max) * 100}%` }}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold">
          Latest activity
        </h2>
        <ul className="divide-y divide-zinc-50">
          {recentEvents.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  e.action === "denied" || e.action === "otp_failed"
                    ? "bg-red-100 text-red-800"
                    : e.action === "view"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {e.action}
              </span>
              <span className="truncate text-zinc-600">
                {e.user?.name ?? e.grant?.granteeLabel ?? "system"}
                {e.guild ? ` · ${e.guild.title}` : ""}
              </span>
              <span className="ml-auto shrink-0 text-xs text-zinc-400">
                {e.ts.toLocaleString()}
              </span>
            </li>
          ))}
          {recentEvents.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-zinc-400">
              Nothing yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
