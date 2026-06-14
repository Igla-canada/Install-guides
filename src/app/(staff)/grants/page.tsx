import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import { createAccessGrant, EXPIRY_OPTIONS } from "@/lib/grants";
import { requestMeta } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import UserPicker from "@/components/guilds/user-picker";

async function createGrant(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN", "TECH");
  const granteeLabel = String(formData.get("granteeLabel") ?? "").trim();
  const maxViewsRaw = String(formData.get("maxViews") ?? "").trim();
  const token = await createAccessGrant({
    userId: user.id,
    granteeLabel,
    granteePhone: String(formData.get("granteePhone") ?? "").trim(),
    hours: Number(formData.get("hours") ?? 24),
    maxViews: maxViewsRaw ? parseInt(maxViewsRaw, 10) : null,
    guildIds: formData.getAll("guildIds").map(String),
  });
  // Token shown exactly once, via query param to the confirmation banner.
  redirect(`/grants?created=${encodeURIComponent(token)}&label=${encodeURIComponent(granteeLabel)}`);
}

async function revokeGrant(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN", "TECH");
  const id = String(formData.get("id"));
  await prisma.accessGrant.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  await prisma.grantSession.deleteMany({ where: { grantId: id } });
  const meta = await requestMeta();
  await logEvent({
    actor: { userId: user.id },
    action: "grant_revoked",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { grantId: id },
  });
  revalidatePath("/grants");
}

export default async function GrantsPage(props: {
  searchParams: Promise<{ created?: string; label?: string }>;
}) {
  await requireRole("ADMIN", "TECH");
  const { created, label } = await props.searchParams;
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  const [grants, publishedGuilds, shareUsers] = await Promise.all([
    prisma.accessGrant.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        guilds: { include: { guild: { select: { title: true } } } },
        grantedBy: { select: { name: true } },
      },
    }),
    prisma.guild.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.userAccount.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, phone: true, role: true },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Access links</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Time-limited, view-only, watermarked access for installers without
        accounts. The installer verifies with an SMS code; every view is logged.
      </p>

      {created && (
        <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-900">
            Link created for {label}. Copy it now — it is shown only once:
          </p>
          <code className="mt-2 block select-all break-all rounded-md bg-white p-2 text-sm">
            {baseUrl}/g/{created}
          </code>
          <p className="mt-2 text-xs text-green-800">
            Send this link to the installer. Opening it sends a one-time code to
            the phone number you entered.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Create */}
        <form action={createGrant} className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">New access link</h2>
          <div className="mt-3 space-y-3">
            {shareUsers.length > 0 && <UserPicker users={shareUsers} />}
            <input
              name="granteeLabel"
              required
              placeholder='Installer (e.g. "Mike @ DT Auto")'
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              name="granteePhone"
              required
              placeholder="Installer mobile (e.g. +1 416 555 0123)"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <label className="flex-1 text-sm">
                <span className="text-xs text-zinc-500">Expires after</span>
                <select name="hours" defaultValue="24" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm">
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.hours} value={o.hours}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-sm">
                <span className="text-xs text-zinc-500">Max views (optional)</span>
                <input
                  name="maxViews"
                  type="number"
                  min={1}
                  placeholder="∞"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
                />
              </label>
            </div>
            <div>
              <span className="text-xs text-zinc-500">Guides (published only)</span>
              <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-zinc-200 p-2">
                {publishedGuilds.length === 0 ? (
                  <p className="text-sm text-zinc-400">
                    Nothing published yet — publish a guild first.
                  </p>
                ) : (
                  publishedGuilds.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 py-0.5 text-sm">
                      <input type="checkbox" name="guildIds" value={g.id} />
                      {g.title}
                    </label>
                  ))
                )}
              </div>
            </div>
            <button className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Create link
            </button>
          </div>
        </form>

        {/* Existing */}
        <div className="rounded-xl border border-zinc-200 bg-white">
          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold">
            Recent links
          </h2>
          <ul className="divide-y divide-zinc-100">
            {grants.map((g) => {
              const now = new Date();
              const state = g.revokedAt
                ? "revoked"
                : g.expiresAt < now
                ? "expired"
                : g.maxViews != null && g.viewsUsed >= g.maxViews
                ? "exhausted"
                : "active";
              return (
                <li key={g.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.granteeLabel}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        state === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {state}
                    </span>
                    {state === "active" && (
                      <form action={revokeGrant} className="ml-auto">
                        <input type="hidden" name="id" value={g.id} />
                        <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                          Revoke now
                        </button>
                      </form>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {g.guilds.map((x) => x.guild.title).join(", ")} · expires{" "}
                    {g.expiresAt.toLocaleString()} · views {g.viewsUsed}
                    {g.maxViews != null ? `/${g.maxViews}` : ""} · by {g.grantedBy.name}
                  </p>
                </li>
              );
            })}
            {grants.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-zinc-400">
                No access links yet.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
