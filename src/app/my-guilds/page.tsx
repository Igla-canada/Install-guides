// Persistent-login installer home: lists granted guilds. Same view-only,
// watermarked experience as one-time links — only the actor type differs.
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, logout } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function MyGuildsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "INSTALLER") redirect("/dashboard");

  const access = await prisma.installerGuild.findMany({
    where: { userId: user.id },
    include: { user: false },
  });
  const guilds = await prisma.guild.findMany({
    where: { id: { in: access.map((a) => a.guildId) }, status: "PUBLISHED" },
    orderBy: { title: "asc" },
    include: { make: true, model: true, generation: true },
  });

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your installation guides</h1>
        <form action={logoutAction}>
          <button className="text-sm text-zinc-400 hover:text-zinc-600">Sign out</button>
        </form>
      </div>
      <p className="mt-1 text-sm text-zinc-500">Signed in as {user.name}.</p>
      <ul className="mt-4 space-y-2">
        {guilds.map((g) => (
          <li key={g.id}>
            <Link
              href={`/view/${g.id}`}
              className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50"
            >
              <span className="text-sm font-medium">{g.title}</span>
              <span className="block text-xs text-zinc-500">
                {g.make.name} {g.model.name} {g.generation.name}
              </span>
            </Link>
          </li>
        ))}
        {guilds.length === 0 && (
          <li className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-400">
            No guides granted to you yet.
          </li>
        )}
      </ul>
    </main>
  );
}
