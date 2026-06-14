// Installer one-time link: token check → SMS one-time code → short viewing
// session. Content never lives in the link; revocation cuts access instantly.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requestMeta } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import {
  GRANT_COOKIE,
  checkGrantToken,
  currentGrant,
  grantCookieOptions,
  sendOtp,
  verifyOtp,
} from "@/lib/grant-auth";

function maskPhone(phone: string): string {
  return phone.replace(/.(?=.{3})/g, "•");
}

export default async function GrantGatePage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { token } = await props.params;
  const { sent, error } = await props.searchParams;
  const check = await checkGrantToken(token);
  const meta = await requestMeta();

  if (!check.ok) {
    await logEvent({
      actor: null,
      action: "denied",
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { reason: check.reason, tokenPrefix: token.slice(0, 8) },
    });
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Access expired</h1>
        <p className="mt-2 text-sm text-zinc-500">
          This installation guide link is no longer valid. Contact the person
          who sent it to you for a new link.
        </p>
      </Shell>
    );
  }
  const grant = check.grant;

  // Already verified on this device?
  const active = await currentGrant();
  if (active?.id === grant.id) {
    const guilds = await prisma.grantGuild.findMany({
      where: { grantId: grant.id },
      include: { guild: { select: { id: true, title: true, status: true } } },
    });
    const visible = guilds.filter((g) => g.guild.status === "PUBLISHED");
    if (visible.length === 1) redirect(`/g/${token}/${visible[0].guild.id}`);
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Your installation guides</h1>
        <ul className="mt-3 space-y-2">
          {visible.map((g) => (
            <li key={g.guild.id}>
              <Link
                href={`/g/${token}/${g.guild.id}`}
                className="block rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium hover:bg-zinc-50"
              >
                {g.guild.title} →
              </Link>
            </li>
          ))}
        </ul>
      </Shell>
    );
  }

  async function sendCodeAction() {
    "use server";
    const c = await checkGrantToken(token);
    if (!c.ok) redirect(`/g/${token}`);
    try {
      await sendOtp(c.grant.id);
    } catch (err) {
      console.error("OTP send failed:", (err as Error).message);
      redirect(`/g/${token}?error=send`);
    }
    const m = await requestMeta();
    await logEvent({
      actor: { grantId: c.grant.id },
      action: "otp_sent",
      ip: m.ip,
      userAgent: m.userAgent,
    });
    redirect(`/g/${token}?sent=1`);
  }

  async function verifyCodeAction(formData: FormData) {
    "use server";
    const c = await checkGrantToken(token);
    if (!c.ok) redirect(`/g/${token}`);
    const code = String(formData.get("code") ?? "");
    const result = await verifyOtp(c.grant.id, code);
    const m = await requestMeta();
    if (!result.ok || !result.sessionToken) {
      await logEvent({
        actor: { grantId: c.grant.id },
        action: "otp_failed",
        ip: m.ip,
        userAgent: m.userAgent,
      });
      redirect(`/g/${token}?sent=1&error=1`);
    }
    const store = await cookies();
    store.set(GRANT_COOKIE, result.sessionToken, grantCookieOptions());
    await logEvent({
      actor: { grantId: c.grant.id },
      action: "otp_verified",
      ip: m.ip,
      userAgent: m.userAgent,
    });
    redirect(`/g/${token}`);
  }

  // Portal-issued links open directly (the portal already authenticated the
  // installer) — no SMS. The session is established by /g/<token>/auto.
  if (grant.directOpen) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Igla installation guide</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Access for <strong>{grant.granteeLabel}</strong>.
        </p>
        <Link
          href={`/g/${token}/auto`}
          className="mt-4 block w-full rounded-md bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-zinc-700"
        >
          Open guide
        </Link>
        <p className="mt-4 text-xs text-zinc-400">
          Expires {grant.expiresAt.toLocaleString()}. Access is personal,
          view-only and logged.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold">Igla installation guide</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Access for <strong>{grant.granteeLabel}</strong>. To continue, verify
        with the code we&apos;ll text to {maskPhone(grant.granteePhone ?? "")}.
      </p>
      {!sent ? (
        <>
          {error === "send" && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              We couldn&apos;t send the code right now. Please try again, or
              contact whoever sent you this link.
            </p>
          )}
          <form action={sendCodeAction} className="mt-4">
            <button className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Text me the code
            </button>
          </form>
        </>
      ) : (
        <>
          {error && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Wrong or expired code. Try again.
            </p>
          )}
          <form action={verifyCodeAction} className="mt-4 space-y-3">
            <input
              name="code"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="6-digit code"
              autoComplete="one-time-code"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-center text-lg tracking-[0.5em]"
            />
            <button className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Verify
            </button>
          </form>
          <form action={sendCodeAction} className="mt-2">
            <button className="w-full text-center text-xs text-zinc-400 hover:text-zinc-600">
              Resend code
            </button>
          </form>
        </>
      )}
      <p className="mt-4 text-xs text-zinc-400">
        Expires {grant.expiresAt.toLocaleString()}. Access is personal,
        view-only and logged.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
