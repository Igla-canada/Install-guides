import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import { createAccessGrant, EXPIRY_OPTIONS } from "@/lib/grants";
import { requestMeta } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import UserPicker from "@/components/guides/user-picker";
import GuildPicker from "@/components/guides/guild-picker";

const err = (msg: string) => redirect(`/grants?error=${encodeURIComponent(msg)}`);

async function createGrant(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN", "TECH");
  const granteeLabel = String(formData.get("granteeLabel") ?? "").trim();
  const granteePhone = String(formData.get("granteePhone") ?? "").trim();
  const hoursRaw = String(formData.get("hours") ?? "24");
  const guildIds = formData.getAll("guildIds").map(String);
  if (hoursRaw === "perm")
    err("Pick a duration for a link, or use “Grant access” for permanent account access.");
  if (!granteeLabel || !granteePhone) err("Installer name and mobile are required for a link.");
  if (guildIds.length === 0) err("Select at least one guide.");
  const maxViewsRaw = String(formData.get("maxViews") ?? "").trim();
  const token = await createAccessGrant({
    userId: user.id,
    granteeLabel,
    granteePhone,
    granteeEmail: String(formData.get("granteeEmail") ?? "").trim() || null,
    hours: Number(hoursRaw),
    maxViews: maxViewsRaw ? parseInt(maxViewsRaw, 10) : null,
    guildIds,
  });
  // Token shown exactly once, via query param to the confirmation banner.
  redirect(`/grants?created=${encodeURIComponent(token)}&label=${encodeURIComponent(granteeLabel)}`);
}

// Grant a persistent INSTALLER account login access to the selected guides with
// the same time-frame rules as /users (a duration, or Permanent). Additive: it
// upserts the picked guides without disturbing the account's other grants.
async function grantAccountAccess(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN", "TECH");
  const userId = String(formData.get("userId") ?? "").trim();
  const guildIds = formData.getAll("guildIds").map(String);
  const hoursRaw = String(formData.get("hours") ?? "perm");
  if (!userId) err("Pick an installer account in the dropdown to grant access to.");
  if (guildIds.length === 0) err("Select at least one guide to grant.");
  const target = await prisma.userAccount.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true },
  });
  if (!target || target.role !== "INSTALLER")
    err("Account access can only be granted to installer accounts.");
  const expiresAt = hoursRaw === "perm" ? null : new Date(Date.now() + Number(hoursRaw) * 3600_000);
  await prisma.$transaction(
    guildIds.map((guildId) =>
      prisma.installerGuild.upsert({
        where: { userId_guildId: { userId, guildId } },
        create: { userId, guildId, expiresAt },
        update: { expiresAt },
      })
    )
  );
  const meta = await requestMeta();
  await logEvent({
    actor: { userId: admin.id },
    action: "installer_access_granted",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { targetUserId: userId, guildIds, expiresAt: expiresAt?.toISOString() ?? null },
  });
  redirect(`/grants?granted=${encodeURIComponent(target!.name)}&count=${guildIds.length}`);
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
  searchParams: Promise<{
    created?: string;
    label?: string;
    granted?: string;
    count?: string;
    error?: string;
  }>;
}) {
  await requireRole("ADMIN", "TECH");
  const { created, label, granted, count, error } = await props.searchParams;
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
      orderBy: [{ make: { name: "asc" } }, { model: { name: "asc" } }],
      include: {
        make: true,
        model: true,
        generation: true,
        iglaProduct: { include: { productLine: true } },
      },
    }),
    prisma.userAccount.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, phone: true, email: true, role: true },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Access &amp; links</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Two ways to share, both view-only, watermarked and logged.{" "}
        <strong>Create link</strong>: a time-limited SMS link for an installer
        without an account. <strong>Grant access</strong>: give an installer
        account login access to the selected guides, with a time frame or
        permanently.
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {granted && (
        <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          Granted {count ?? ""} guide{count === "1" ? "" : "s"} to <strong>{granted}</strong>. They
          can sign in and see them under “Your installation guides”.
        </div>
      )}

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
          <h2 className="text-sm font-semibold">Share with an installer</h2>
          <div className="mt-3 space-y-3">
            {shareUsers.length > 0 && <UserPicker users={shareUsers} />}
            <input
              name="granteeLabel"
              placeholder='Link only — installer name (e.g. "Mike @ DT Auto")'
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              name="granteePhone"
              placeholder="Link only — installer mobile (e.g. +1 416 555 0123)"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              name="granteeEmail"
              type="email"
              placeholder="Email the link to (optional)"
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
                  <option value="perm">Permanent (Grant access only)</option>
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
              <GuildPicker
                guilds={publishedGuilds.map((g) => ({
                  id: g.id,
                  title: g.title,
                  sub: `${g.make.name} ${g.model.name} ${g.generation.name} · ${g.iglaProduct.productLine.name} ${g.iglaProduct.name}`,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                formAction={createGrant}
                className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                title="Create a time-limited SMS link for an installer without an account"
              >
                Create link
              </button>
              <button
                formAction={grantAccountAccess}
                className="flex-1 rounded-md border border-zinc-900 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
                title="Give the selected installer account login access to the selected guides"
              >
                Grant access
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              <strong>Create link</strong> uses the name + mobile above.{" "}
              <strong>Grant access</strong> uses the account picked in the dropdown.
            </p>
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
                    {g.maxViews != null ? `/${g.maxViews}` : ""} · by{" "}
                    {g.grantedBy?.name ?? "Igla portal"}
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
