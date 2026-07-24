import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { requestPasswordReset } from "@/lib/password-reset";

async function forgotAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  await requestPasswordReset(email);
  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/");
  const { sent } = await props.searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold">Forgot password</h1>
        <p className="mt-1 text-center text-sm text-zinc-500">
          Enter your account email and we&apos;ll send a reset link.
        </p>

        {sent ? (
          <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            If an account exists for that email, we sent a reset link. Check your inbox
            (and spam). The link expires in one hour.
          </p>
        ) : (
          <form action={forgotAction} className="mt-6 space-y-4">
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
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Send reset link
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-zinc-600 hover:text-zinc-900">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
