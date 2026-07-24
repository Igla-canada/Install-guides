import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import {
  completePasswordReset,
  verifyPasswordResetToken,
} from "@/lib/password-reset";

async function resetAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) {
    redirect(`/reset-password/${encodeURIComponent(token)}?error=mismatch`);
  }
  const result = await completePasswordReset(token, password);
  if (!result.ok) {
    const code =
      result.error.includes("8 characters") ? "short" : "invalid";
    redirect(`/reset-password/${encodeURIComponent(token)}?error=${code}`);
  }
  redirect("/login?reset=1");
}

export default async function ResetPasswordPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/");

  const { token } = await props.params;
  const { error } = await props.searchParams;
  const account = await verifyPasswordResetToken(token);

  if (!account) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-center text-xl font-semibold">Link expired</h1>
          <p className="mt-4 text-center text-sm text-zinc-600">
            This password reset link is invalid or has expired.
          </p>
          <p className="mt-6 text-center text-sm">
            <Link href="/forgot-password" className="text-zinc-900 underline">
              Request a new link
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold">Choose a new password</h1>
        <p className="mt-1 text-center text-sm text-zinc-500">
          Signed in as {account.email}
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "mismatch"
              ? "Passwords do not match."
              : error === "short"
              ? "Password must be at least 8 characters."
              : "This reset link is invalid or has expired."}
          </p>
        )}

        <form action={resetAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="block text-sm font-medium" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Update password
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-zinc-600 hover:text-zinc-900">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
