import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, logout } from "@/lib/auth";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "TECH"] },
  { href: "/guides", label: "Guides", roles: ["ADMIN", "TECH"] },
  { href: "/compatibility", label: "Compatibility", roles: ["ADMIN", "TECH"] },
  { href: "/grants", label: "Access links", roles: ["ADMIN", "TECH"] },
  { href: "/quick-picks", label: "Quick picks", roles: ["ADMIN", "TECH"] },
  { href: "/files", label: "Files", roles: ["ADMIN"] },
  { href: "/export", label: "Export PDF", roles: ["ADMIN", "TECH"] },
  { href: "/alerts", label: "Alerts", roles: ["ADMIN"] },
  { href: "/audit", label: "Audit log", roles: ["ADMIN"] },
  { href: "/users", label: "Admin", roles: ["ADMIN"] },
] as const;

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "INSTALLER") redirect("/my-guides");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2">
          <Link href="/dashboard" className="mr-4 shrink-0 font-semibold">
            Igla Guides
          </Link>
          {NAV.filter((n) => (n.roles as readonly string[]).includes(user.role)).map(
            (n) => (
              <Link
                key={n.href}
                href={n.href}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                {n.label}
              </Link>
            )
          )}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {user.name} · {user.role.toLowerCase()}
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
        {children}
      </main>
    </div>
  );
}
