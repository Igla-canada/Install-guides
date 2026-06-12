import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import Link from "next/link";

async function setAlertStatus(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as "ACK" | "RESOLVED";
  await prisma.alert.update({ where: { id }, data: { status } });
  revalidatePath("/alerts");
}

async function revokeFromAlert(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const grantId = String(formData.get("grantId"));
  await prisma.accessGrant.update({
    where: { id: grantId },
    data: { revokedAt: new Date() },
  });
  await prisma.grantSession.deleteMany({ where: { grantId } });
  revalidatePath("/alerts");
}

const RULE_LABELS: Record<string, string> = {
  burst_views: "Unusually many views in a short window",
  cross_make: "Views across many unrelated makes",
  repeated_denied: "Repeated denied/expired attempts (probing)",
  new_device: "Known grantee from a new device/IP",
  pdf_download: "Download attempt on installer access",
};

export default async function AlertsPage() {
  await requireRole("ADMIN");
  const alerts = await prisma.alert.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  const grantIds = alerts.map((a) => a.grantId).filter(Boolean) as string[];
  const userIds = alerts.map((a) => a.userId).filter(Boolean) as string[];
  const [grants, users] = await Promise.all([
    prisma.accessGrant.findMany({ where: { id: { in: grantIds } } }),
    prisma.userAccount.findMany({ where: { id: { in: userIds } } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Alerts</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Possible abuse patterns. This is deterrence and forensics, not
        prevention — investigate the{" "}
        <Link href="/audit" className="underline">
          audit trail
        </Link>{" "}
        before acting.
      </p>

      <ul className="mt-4 space-y-3">
        {alerts.map((a) => {
          const grant = grants.find((g) => g.id === a.grantId);
          const user = users.find((u) => u.id === a.userId);
          const actorLabel = grant
            ? `link: ${grant.granteeLabel}`
            : user
            ? `account: ${user.name}`
            : "unknown actor";
          return (
            <li
              key={a.id}
              className={`rounded-xl border bg-white p-4 ${
                a.status === "NEW"
                  ? a.severity === "high"
                    ? "border-red-300"
                    : "border-amber-300"
                  : "border-zinc-200 opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.severity === "high"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {a.severity}
                </span>
                <span className="text-sm font-medium">
                  {RULE_LABELS[a.rule] ?? a.rule}
                </span>
                <span className="text-xs text-zinc-500">· {actorLabel}</span>
                <span className="ml-auto text-xs text-zinc-400">
                  {a.createdAt.toLocaleString()} · {a.status.toLowerCase()}
                </span>
              </div>
              <pre className="mt-2 overflow-x-auto rounded bg-zinc-50 p-2 text-xs text-zinc-500">
                {JSON.stringify(a.details, null, 1)}
              </pre>
              {a.status !== "RESOLVED" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {grant && !grant.revokedAt && (
                    <form action={revokeFromAlert}>
                      <input type="hidden" name="grantId" value={grant.id} />
                      <button className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500">
                        Revoke this access link now
                      </button>
                    </form>
                  )}
                  {a.status === "NEW" && (
                    <form action={setAlertStatus}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="ACK" />
                      <button className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100">
                        Acknowledge
                      </button>
                    </form>
                  )}
                  <form action={setAlertStatus}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="status" value="RESOLVED" />
                    <button className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100">
                      Resolve
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
        {alerts.length === 0 && (
          <li className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-400">
            No alerts. Quiet is good.
          </li>
        )}
      </ul>
    </div>
  );
}
