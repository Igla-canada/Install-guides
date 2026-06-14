import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function AuditPage(props: {
  searchParams: Promise<{ action?: string; guild?: string }>;
}) {
  await requireRole("ADMIN");
  const { action, guild } = await props.searchParams;

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(guild ? { guildId: guild } : {}),
    },
    orderBy: { ts: "desc" },
    take: 200,
    include: {
      user: { select: { name: true, role: true } },
      grant: { select: { granteeLabel: true } },
      guild: { select: { title: true } },
    },
  });

  const actions = await prisma.auditEvent.findMany({
    distinct: ["action"],
    select: { action: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Every access to every guild, by account or access link — the forensic
        trail behind the watermark.
      </p>

      <form className="mt-4 flex gap-2" method="get">
        <select name="action" defaultValue={action ?? ""} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a.action} value={a.action}>
              {a.action}
            </option>
          ))}
        </select>
        <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Guild</th>
              <th className="hidden px-4 py-2 md:table-cell">IP / device</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-zinc-50 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-500">
                  {e.ts.toLocaleString()}
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
    </div>
  );
}
