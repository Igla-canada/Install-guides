import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { easternDayBoundary, fmtDateTime } from "@/lib/datetime";
import type { Prisma } from "@prisma/client";

const PAGE_SIZES = [25, 50, 100, 200, 500] as const;
const DEFAULT_SIZE = 50;

type Search = {
  action?: string;
  guild?: string;
  /** Legacy inbound link from the alerts page. Folded into `actor`. */
  grant?: string;
  /** "u:<userId>" for a staff account, "g:<grantId>" for an access link. */
  actor?: string;
  from?: string;
  to?: string;
  size?: string;
  page?: string;
};

/** Rebuild the query string, dropping empties and resetting the page. */
function hrefWith(current: Search, patch: Partial<Search>): string {
  const next: Search = { ...current, ...patch };
  // Any filter change invalidates the page number — page 7 of a new filter is
  // usually empty, which reads as "no results" when there are plenty.
  if (!("page" in patch)) delete next.page;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v != null && String(v).trim() !== "") sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `/audit?${qs}` : "/audit";
}

export default async function AuditPage(props: { searchParams: Promise<Search> }) {
  await requireRole("ADMIN");
  const sp = await props.searchParams;

  const action = sp.action?.trim() || "";
  const guild = sp.guild?.trim() || "";
  const from = sp.from?.trim() || "";
  const to = sp.to?.trim() || "";
  // The alerts page still links ?grant=<id>; treat it as an actor selection.
  const actor = sp.actor?.trim() || (sp.grant?.trim() ? `g:${sp.grant.trim()}` : "");
  const actorUserId = actor.startsWith("u:") ? actor.slice(2) : "";
  const actorGrantId = actor.startsWith("g:") ? actor.slice(2) : "";

  const size = PAGE_SIZES.includes(Number(sp.size) as (typeof PAGE_SIZES)[number])
    ? Number(sp.size)
    : DEFAULT_SIZE;

  const gte = from ? easternDayBoundary(from, "start") : null;
  const lte = to ? easternDayBoundary(to, "end") : null;

  const where: Prisma.AuditEventWhereInput = {
    ...(action ? { action } : {}),
    ...(guild ? { guildId: guild } : {}),
    ...(actorUserId ? { userId: actorUserId } : {}),
    ...(actorGrantId ? { grantId: actorGrantId } : {}),
    ...(gte || lte ? { ts: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
  };

  const total = await prisma.auditEvent.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pageCount);

  const [events, actions, guideRows, userRows, grantRows] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { ts: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: {
        user: { select: { name: true, role: true } },
        grant: { select: { granteeLabel: true } },
        guild: { select: { title: true } },
      },
    }),
    prisma.auditEvent.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    // Filter options list only what actually appears in the log — a dropdown of
    // 800 guides that mostly return nothing is worse than no dropdown.
    prisma.auditEvent.findMany({
      distinct: ["guildId"],
      where: { guildId: { not: null } },
      select: { guildId: true },
    }),
    prisma.auditEvent.findMany({
      distinct: ["userId"],
      where: { userId: { not: null } },
      select: { userId: true },
    }),
    prisma.auditEvent.findMany({
      distinct: ["grantId"],
      where: { grantId: { not: null } },
      select: { grantId: true },
    }),
  ]);

  const [guides, users, grants] = await Promise.all([
    prisma.guild.findMany({
      where: { id: { in: guideRows.map((g) => g.guildId!).filter(Boolean) } },
      select: { id: true, title: true, make: { select: { name: true } }, model: { select: { name: true } } },
    }),
    prisma.userAccount.findMany({
      where: { id: { in: userRows.map((u) => u.userId!).filter(Boolean) } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.accessGrant.findMany({
      where: { id: { in: grantRows.map((g) => g.grantId!).filter(Boolean) } },
      select: { id: true, granteeLabel: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const guideOptions = guides
    .map((g) => ({ id: g.id, label: `${g.make.name} ${g.model.name} — ${g.title}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const filtered = Boolean(action || guild || actor || from || to);
  const firstRow = total === 0 ? 0 : (page - 1) * size + 1;
  const lastRow = Math.min(page * size, total);

  const input =
    "rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Every access to every guide, by account or access link — the forensic
        trail behind the watermark.
      </p>

      <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">From</span>
          <input type="date" name="from" defaultValue={from} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">To</span>
          <input type="date" name="to" defaultValue={to} className={input} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Action</span>
          <select name="action" defaultValue={action} className={input}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>
                {a.action}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Actor</span>
          <select name="actor" defaultValue={actor} className={`${input} max-w-[16rem]`}>
            <option value="">Anyone</option>
            {users.length > 0 && (
              <optgroup label="Staff accounts">
                {users.map((u) => (
                  <option key={u.id} value={`u:${u.id}`}>
                    {u.name} ({u.role.toLowerCase()})
                  </option>
                ))}
              </optgroup>
            )}
            {grants.length > 0 && (
              <optgroup label="Access links">
                {grants.map((g) => (
                  <option key={g.id} value={`g:${g.id}`}>
                    {g.granteeLabel}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Guide</span>
          <select name="guild" defaultValue={guild} className={`${input} max-w-[18rem]`}>
            <option value="">All guides</option>
            {guideOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Per page</span>
          <select name="size" defaultValue={String(size)} className={input}>
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
          Filter
        </button>
        {filtered && (
          <Link href="/audit" className="px-2 py-1.5 text-sm text-zinc-500 underline hover:text-zinc-800">
            Clear
          </Link>
        )}
      </form>

      <p className="mt-3 text-xs text-zinc-500">
        {total === 0
          ? "No events match."
          : `Showing ${firstRow}–${lastRow} of ${total.toLocaleString()} event${total === 1 ? "" : "s"}${
              filtered ? " (filtered)" : ""
            } · page ${page} of ${pageCount}`}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Guide</th>
              <th className="hidden px-4 py-2 md:table-cell">IP / device</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-zinc-50 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-500">
                  {fmtDateTime(e.ts)}
                </td>
                <td className="px-4 py-2">
                  {e.user
                    ? `${e.user.name} (${e.user.role.toLowerCase()})`
                    : e.grant
                    ? `${e.grant.granteeLabel} (link)`
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      e.action === "denied" || e.action === "otp_failed"
                        ? "bg-red-100 text-red-800"
                        : e.action === "view"
                        ? "bg-blue-100 text-blue-800"
                        : e.action === "revisit"
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600">{e.guild?.title ?? "—"}</td>
                <td className="hidden px-4 py-2 text-xs text-zinc-400 md:table-cell">
                  {e.ip ?? "—"}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-400">
                  No events match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-label="Pagination">
          <PageLink sp={sp} to={1} disabled={page === 1} label="« First" />
          <PageLink sp={sp} to={page - 1} disabled={page === 1} label="‹ Previous" />
          <span className="px-2 text-zinc-500">
            Page {page} of {pageCount}
          </span>
          <PageLink sp={sp} to={page + 1} disabled={page === pageCount} label="Next ›" />
          <PageLink sp={sp} to={pageCount} disabled={page === pageCount} label="Last »" />
        </nav>
      )}
    </div>
  );
}

function PageLink({
  sp,
  to,
  disabled,
  label,
}: {
  sp: Search;
  to: number;
  disabled: boolean;
  label: string;
}) {
  const cls = "rounded-md border border-zinc-300 px-3 py-1.5";
  if (disabled) {
    return <span className={`${cls} cursor-default text-zinc-300`}>{label}</span>;
  }
  return (
    <Link href={hrefWith(sp, { page: String(to) })} className={`${cls} hover:bg-zinc-100`}>
      {label}
    </Link>
  );
}
