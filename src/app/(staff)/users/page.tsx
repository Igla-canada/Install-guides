import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EXPIRY_OPTIONS } from "@/lib/grants";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import MakeLogo from "@/components/guides/make-logo";
import NotifyTest from "@/components/admin/notify-test";
import InstallerAccessForm from "@/components/users/installer-access-form";
import TaxonomyManager from "@/components/admin/taxonomy-manager";

async function setMakeLogo(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  await prisma.make.update({ where: { id }, data: { logoUrl } });
  revalidatePath("/users");
  revalidatePath("/guides");
}

async function createUser(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "TECH") as "ADMIN" | "TECH" | "INSTALLER";
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  if (!email || !name || password.length < 8) throw new Error("invalid input");
  await prisma.userAccount.create({
    data: { email, name, phone, role, passwordHash: await bcrypt.hash(password, 12) },
  });
  revalidatePath("/users");
}

// Edit an existing user's details. Role/status changes to your OWN account are
// ignored so an admin can't lock themselves out; password is optional (blank
// keeps the current one).
async function editUser(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "TECH") as "ADMIN" | "TECH" | "INSTALLER";
  const status = String(formData.get("status") ?? "ACTIVE") as "ACTIVE" | "DISABLED";
  const newPassword = String(formData.get("password") ?? "");
  if (!email || !name) throw new Error("name and email are required");
  const data: {
    email: string;
    name: string;
    phone: string | null;
    role?: "ADMIN" | "TECH" | "INSTALLER";
    status?: "ACTIVE" | "DISABLED";
    passwordHash?: string;
  } = { email, name, phone };
  if (id !== admin.id) {
    data.role = role;
    data.status = status;
  }
  if (newPassword) {
    if (newPassword.length < 8) throw new Error("password must be at least 8 chars");
    data.passwordHash = await bcrypt.hash(newPassword, 12);
  }
  await prisma.userAccount.update({ where: { id }, data });
  if (id !== admin.id && status === "DISABLED") {
    await prisma.session.deleteMany({ where: { userId: id } }); // kick live sessions
  }
  revalidatePath("/users");
}

async function toggleUser(formData: FormData) {
  "use server";
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id"));
  if (id === admin.id) return; // don't lock yourself out
  const user = await prisma.userAccount.findUnique({ where: { id } });
  if (!user) return;
  await prisma.userAccount.update({
    where: { id },
    data: { status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
  });
  // Kill any live sessions when disabling.
  if (user.status === "ACTIVE") {
    await prisma.session.deleteMany({ where: { userId: id } });
  }
  revalidatePath("/users");
}

async function addProduct(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const productLineId = String(formData.get("productLineId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!productLineId || !name) return;
  await prisma.iglaProduct.create({
    data: {
      productLineId,
      name,
      modelCode: String(formData.get("modelCode") ?? "").trim() || null,
    },
  });
  revalidatePath("/users");
}

async function deleteProduct(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  // Fails (silently here) if any guild references it — that's the safe default.
  await prisma.iglaProduct
    .delete({ where: { id: String(formData.get("id")) } })
    .catch(() => null);
  revalidatePath("/users");
}

async function setInstallerGuilds(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const userId = String(formData.get("userId"));
  // "All guides" blanket access: when on, per-guild rows are irrelevant — the
  // installer sees every published guide (old + future). Persist the flag and
  // skip rebuilding the per-guild list.
  const allGuides = formData.get("allGuides") === "on";
  await prisma.userAccount.update({ where: { id: userId }, data: { allGuides } });
  if (allGuides) {
    revalidatePath("/users");
    return;
  }
  const guildIds = formData.getAll("guildIds").map(String);
  // Preserve existing expiries for rows the admin left as "keep".
  const existing = await prisma.installerGuild.findMany({ where: { userId } });
  const prior = new Map(existing.map((e) => [e.guildId, e.expiresAt] as const));
  const now = Date.now();
  const rows = guildIds.map((guildId) => {
    const v = String(formData.get(`expiry__${guildId}`) ?? "perm");
    let expiresAt: Date | null;
    if (v === "keep") expiresAt = prior.get(guildId) ?? null;
    else if (v === "perm") expiresAt = null;
    else expiresAt = new Date(now + Number(v) * 3600_000);
    return { userId, guildId, expiresAt };
  });
  await prisma.$transaction([
    prisma.installerGuild.deleteMany({ where: { userId } }),
    prisma.installerGuild.createMany({ data: rows }),
  ]);
  revalidatePath("/users");
}

const ADMIN_TABS = [
  { id: "users", label: "Users" },
  { id: "products", label: "Products" },
  { id: "taxonomy", label: "Vehicle taxonomy" },
  { id: "logos", label: "Logos" },
] as const;

function AdminTabs({ active }: { active: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1 border-b border-zinc-200">
      {ADMIN_TABS.map((t) => (
        <Link
          key={t.id}
          href={`/users?tab=${t.id}`}
          className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm ${
            active === t.id
              ? "border-zinc-900 font-medium text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export default async function UsersPage(props: {
  searchParams: Promise<{ taxError?: string; tab?: string }>;
}) {
  const admin = await requireRole("ADMIN");
  const { taxError, tab: tabRaw } = await props.searchParams;
  const tab = ADMIN_TABS.some((t) => t.id === tabRaw) ? (tabRaw as string) : "users";
  const users = await prisma.userAccount.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { installerGrants: { include: { user: false } } },
  });
  const publishedGuilds = await prisma.guild.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  const installerAccess = await prisma.installerGuild.findMany();
  const makes = await prisma.make.findMany({ orderBy: { name: "asc" } });
  const productLines = await prisma.productLine.findMany({
    orderBy: { name: "asc" },
    include: {
      products: {
        orderBy: { name: "asc" },
        // guilds = times it's a guide's PRIMARY product (the FK that blocks a
        // delete); guildLinks = every guide that covers it. Either means in-use.
        include: { _count: { select: { guilds: true, guildLinks: true } } },
      },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin</h1>
      <AdminTabs active={tab} />

      {tab === "users" && (
      <>
      <p className="mt-4 text-sm text-zinc-500">
        Staff accounts (admin/tech) and persistent installer accounts.
        Installers only ever get the view-only, watermarked experience.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Guide access (installers)</th>
              <th className="px-4 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const access = installerAccess.filter((a) => a.userId === u.id);
              return (
                <tr key={u.id} className="border-b border-zinc-100 align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-zinc-500">{u.email}</div>
                    {u.phone && <div className="text-xs text-zinc-400">{u.phone}</div>}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700">
                        ✎ Edit
                      </summary>
                      <form action={editUser} className="mt-2 grid max-w-xs gap-1.5">
                        <input type="hidden" name="id" value={u.id} />
                        <input
                          name="name"
                          defaultValue={u.name}
                          required
                          placeholder="Full name"
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                        />
                        <input
                          name="email"
                          type="email"
                          defaultValue={u.email}
                          required
                          placeholder="Email"
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                        />
                        <input
                          name="phone"
                          defaultValue={u.phone ?? ""}
                          placeholder="Mobile (+1 416 555 0123)"
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                        />
                        <div className="flex gap-1.5">
                          <select
                            name="role"
                            defaultValue={u.role}
                            disabled={u.id === admin.id}
                            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
                            title={u.id === admin.id ? "Can't change your own role" : "Role"}
                          >
                            <option value="TECH">Tech</option>
                            <option value="ADMIN">Admin</option>
                            <option value="INSTALLER">Installer</option>
                          </select>
                          <select
                            name="status"
                            defaultValue={u.status}
                            disabled={u.id === admin.id}
                            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
                            title={u.id === admin.id ? "Can't change your own status" : "Status"}
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="DISABLED">Disabled</option>
                          </select>
                        </div>
                        <input
                          name="password"
                          type="password"
                          minLength={8}
                          placeholder="New password (blank = keep)"
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                        />
                        <button className="rounded-md bg-zinc-900 px-2 py-1 text-sm font-medium text-white hover:bg-zinc-700">
                          Save changes
                        </button>
                      </form>
                    </details>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                      {u.role.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === "INSTALLER" ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-zinc-500">
                          {u.allGuides
                            ? "All guides (incl. future)"
                            : `${access.length} guide${access.length === 1 ? "" : "s"} granted`}
                        </summary>
                        <InstallerAccessForm
                          userId={u.id}
                          guilds={publishedGuilds}
                          allGuides={u.allGuides}
                          access={access.map((a) => ({
                            guildId: a.guildId,
                            expiresAt: a.expiresAt ? a.expiresAt.getTime() : null,
                          }))}
                          expiryOptions={EXPIRY_OPTIONS}
                          action={setInstallerGuilds}
                        />
                      </details>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={toggleUser} className="inline">
                      <input type="hidden" name="id" value={u.id} />
                      <button
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          u.status === "ACTIVE"
                            ? "bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-800"
                            : "bg-red-100 text-red-800 hover:bg-green-100 hover:text-green-800"
                        }`}
                        title={u.status === "ACTIVE" ? "Click to disable" : "Click to enable"}
                      >
                        {u.status.toLowerCase()}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-medium">Add user</h2>
      <form
        action={createUser}
        className="mt-2 grid max-w-2xl gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2"
      >
        <input name="name" required placeholder="Full name" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input name="email" type="email" required placeholder="Email" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <input name="phone" placeholder="Mobile (optional, +1 416 555 0123)" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <select name="role" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <option value="TECH">Tech (author)</option>
          <option value="ADMIN">Admin</option>
          <option value="INSTALLER">Installer (view-only login)</option>
        </select>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 chars)"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:col-span-2">
          Create user
        </button>
      </form>

      <div className="mt-8">
        <NotifyTest />
      </div>
      </>
      )}

      {/* Product catalog — the only thing that needs pre-managing (a fixed
          device list). Vehicles are auto-created from the New-guild form. */}
      {tab === "products" && (
      <div className="mt-6 max-w-2xl">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Igla product catalog</h2>
          {productLines.map((pl) => (
            <div key={pl.id} className="mt-2">
              <div className="text-xs font-medium uppercase text-zinc-400">{pl.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {pl.products.map((p) => {
                  const primary = p._count.guilds;
                  const inUse = primary > 0 || p._count.guildLinks > 0;
                  // In-use products can't be deleted (guides reference them) —
                  // show the count instead of a dead ✕. Unused ones get a real,
                  // working delete (the chip itself is the form, so no invalid
                  // <form>-inside-<span> that silently broke the button before).
                  return inUse ? (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs"
                      title={`Used by ${primary} guide${primary === 1 ? "" : "s"} — repoint those guides before it can be removed`}
                    >
                      {p.name}
                      <span className="text-zinc-400">· {primary}</span>
                    </span>
                  ) : (
                    <form
                      key={p.id}
                      action={deleteProduct}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs"
                    >
                      <input type="hidden" name="id" value={p.id} />
                      {p.name}
                      <button className="text-zinc-300 hover:text-red-500" title="Delete (unused)">
                        ✕
                      </button>
                    </form>
                  );
                })}
              </div>
            </div>
          ))}
          <form action={addProduct} className="mt-3 flex flex-wrap gap-2">
            <select name="productLineId" required className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
              {productLines.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                </option>
              ))}
            </select>
            <input name="name" required placeholder="Product name" className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <button className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100">
              Add
            </button>
          </form>
        </div>
      </div>
      )}

      {tab === "taxonomy" && <TaxonomyManager error={taxError} />}

      {/* Manufacturer logos — shown on the Guides menu tiles. Known brands get
          a logo automatically; paste a URL to set or fix any of them. */}
      {tab === "logos" && (
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Manufacturer logos</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Shown on the Guides menu. Leave blank to auto-detect by brand name;
          paste an image URL to override (e.g. a transparent PNG/SVG).
        </p>
        {makes.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No makes yet — they appear as you create guides.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {makes.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <MakeLogo name={m.name} logoUrl={m.logoUrl} size={32} />
                <span className="w-28 shrink-0 truncate text-sm font-medium">{m.name}</span>
                <form action={setMakeLogo} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input
                    name="logoUrl"
                    defaultValue={m.logoUrl ?? ""}
                    placeholder="Logo image URL (optional)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                  />
                  <button className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100">
                    Save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}
