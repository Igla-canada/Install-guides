import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import MakeLogo from "@/components/guilds/make-logo";
import NotifyTest from "@/components/admin/notify-test";

async function setMakeLogo(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  await prisma.make.update({ where: { id }, data: { logoUrl } });
  revalidatePath("/users");
  revalidatePath("/guilds");
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

async function addInventoryUnit(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const serial = String(formData.get("serial") ?? "").trim();
  const iglaProductId = String(formData.get("iglaProductId") ?? "");
  if (!serial || !iglaProductId) return;
  await prisma.inventoryUnit
    .create({ data: { serial, iglaProductId } })
    .catch(() => null);
  revalidatePath("/users");
}

async function deleteInventoryUnit(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  await prisma.inventoryUnit
    .delete({ where: { id: String(formData.get("id")) } })
    .catch(() => null);
  revalidatePath("/users");
}

async function setInstallerGuilds(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const userId = String(formData.get("userId"));
  const guildIds = formData.getAll("guildIds").map(String);
  await prisma.$transaction([
    prisma.installerGuild.deleteMany({ where: { userId } }),
    prisma.installerGuild.createMany({
      data: guildIds.map((guildId) => ({ userId, guildId })),
    }),
  ]);
  revalidatePath("/users");
}

export default async function UsersPage() {
  const admin = await requireRole("ADMIN");
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
    include: { products: { orderBy: { name: "asc" } } },
  });
  const inventory = await prisma.inventoryUnit.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { iglaProduct: { include: { productLine: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Staff accounts (admin/tech) and persistent installer accounts.
        Installers only ever get the view-only, watermarked experience.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Role</th>
              <th className="hidden px-4 py-2 md:table-cell">Guide access (installers)</th>
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
                  <td className="hidden px-4 py-3 md:table-cell">
                    {u.role === "INSTALLER" ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-zinc-500">
                          {access.length} guide{access.length === 1 ? "" : "s"} granted
                        </summary>
                        <form action={setInstallerGuilds} className="mt-2 space-y-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <div className="max-h-40 overflow-y-auto rounded border border-zinc-200 p-2">
                            {publishedGuilds.map((g) => (
                              <label key={g.id} className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  name="guildIds"
                                  value={g.id}
                                  defaultChecked={access.some((a) => a.guildId === g.id)}
                                />
                                {g.title}
                              </label>
                            ))}
                            {publishedGuilds.length === 0 && (
                              <p className="text-xs text-zinc-400">No published guides yet.</p>
                            )}
                          </div>
                          <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                            Save access
                          </button>
                        </form>
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

      {/* Product catalog — the only thing that needs pre-managing (a fixed
          device list). Vehicles are auto-created from the New-guild form. */}
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Igla product catalog</h2>
          {productLines.map((pl) => (
            <div key={pl.id} className="mt-2">
              <div className="text-xs font-medium uppercase text-zinc-400">{pl.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {pl.products.map((p) => (
                  <span key={p.id} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                    {p.name}
                    <form action={deleteProduct} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <button className="text-zinc-300 hover:text-red-500" title="Delete (blocked if any guild uses it)">
                        ✕
                      </button>
                    </form>
                  </span>
                ))}
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

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Unit serials (serial → product)</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Lets the Igla app identify the product from a scanned unit serial.
            Replaced by the portal inventory API when available.
          </p>
          <ul className="mt-2 max-h-48 overflow-y-auto text-sm">
            {inventory.map((u) => (
              <li key={u.id} className="flex items-center border-b border-zinc-50 py-1">
                <span className="font-mono text-xs">{u.serial}</span>
                <span className="ml-2 text-zinc-500">→ {u.iglaProduct.name}</span>
                <form action={deleteInventoryUnit} className="ml-auto">
                  <input type="hidden" name="id" value={u.id} />
                  <button className="px-1 text-zinc-300 hover:text-red-500">✕</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addInventoryUnit} className="mt-2 flex flex-wrap gap-2">
            <input name="serial" required placeholder="Unit serial" className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <select name="iglaProductId" required className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
              {productLines.flatMap((pl) =>
                pl.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
            <button className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100">
              Add
            </button>
          </form>
        </div>
      </div>

      {/* Manufacturer logos — shown on the Guides menu tiles. Known brands get
          a logo automatically; paste a URL to set or fix any of them. */}
      <div className="mt-10 rounded-xl border border-zinc-200 bg-white p-4">
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
    </div>
  );
}
