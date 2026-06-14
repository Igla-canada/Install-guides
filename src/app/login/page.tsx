import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  login,
  currentUser,
  SESSION_COOKIE,
  SESSION_TTL_HOURS,
  sessionCookieOptions,
} from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { requestMeta } from "@/lib/auth";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await login(email, password);
  if (!result) {
    redirect("/login?error=1");
  }
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  const store = await cookies();
  store.set(SESSION_COOKIE, result.token, sessionCookieOptions(expiresAt));
  const meta = await requestMeta();
  await logEvent({
    actor: { userId: result.user.id },
    action: "login",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  redirect(result.user.role === "INSTALLER" ? "/my-guilds" : "/dashboard");
}

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/");
  const { error } = await props.searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Igla Guides</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Installation guide system — staff &amp; installer sign in
        </p>
        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Invalid email or password.
          </p>
        )}
        <form action={loginAction} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
