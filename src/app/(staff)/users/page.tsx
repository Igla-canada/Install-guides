import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

async function createUser(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "TECH") as "ADMIN" | "TECH" | "INSTALLER";
  const password = String(formData.get("password") ?? "");
  if (!email || !name || password.length < 8) throw new Error("invalid input");
  await prisma.userAccount.create({
    data: { email, name, role, passwordHash: await bcrypt.hash(password, 12) },
  });
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
  await requireRole("ADMIN");
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
              <th className="hidden px-4 py-2 md:table-cell">Guild access (installers)</th>
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
                          {access.length} guild{access.length === 1 ? "" : "s"} granted
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
                              <p className="text-xs text-zinc-400">No published guilds yet.</p>
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
    </div>
  );
}
