// Persistent-login installer home. Same hierarchical browsing UI as the admin
// guide library (GuideBrowser), but limited to the published guides assigned to
// this installer and still within their time frame. View-only: rows link to the
// watermarked /view page, and there are no editor/status/new-guide affordances.
import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser, logout } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GuideBrowser } from "@/components/guides/guide-browser";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function MyGuidesPage(props: {
  searchParams: Promise<{ make?: string; year?: string; model?: string; q?: string }>;
}) {
  const sp = await props.searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "INSTALLER") redirect("/dashboard");

  // "All guides" installers see every published guide; others see only grants
  // still within their time frame (null expiresAt = permanent).
  const access = user.allGuides
    ? null
    : await prisma.installerGuild.findMany({
        where: {
          userId: user.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
  const guilds = await prisma.guild.findMany({
    where: {
      status: "PUBLISHED",
      ...(access ? { id: { in: access.map((a) => a.guildId) } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      make: true,
      model: true,
      generation: true,
      trim: true,
      iglaProduct: { include: { productLine: true } },
    },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2">
          <Link href="/my-guides" className="mr-4 shrink-0 font-semibold">
            Igla Guides
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {user.name} · installer
            </span>
            <form action={logoutAction}>
              <button className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <GuideBrowser
          guilds={guilds}
          sp={sp}
          basePath="/my-guides"
          title="Your installation guides"
          guideHref={(id) => `/view/${id}`}
        />
      </main>
    </div>
  );
}
