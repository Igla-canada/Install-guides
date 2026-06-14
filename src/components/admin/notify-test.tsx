"use client";
// Admin diagnostic: send a test SMS + email through the live providers and show
// the per-channel result (or the raw Twilio/SendGrid error) to verify config.
import { useState } from "react";

type Result = {
  smsMode: string;
  emailMode: string;
  sms?: { ok: boolean; error?: string };
  email?: { ok: boolean; error?: string };
};

export default function NotifyTest() {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setRes(null);
    setErr(null);
    try {
      const r = await fetch("/api/admin/test-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, email }),
      });
      if (!r.ok) {
        setErr(`Request failed (${r.status})`);
      } else {
        setRes(await r.json());
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const Line = ({ label, mode, r }: { label: string; mode: string; r?: { ok: boolean; error?: string } }) => (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-14 shrink-0 font-medium">{label}</span>
      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{mode}</span>
      {r ? (
        r.ok ? (
          <span className="text-green-700">✓ sent</span>
        ) : (
          <span className="break-all text-red-600">✗ {r.error}</span>
        )
      ) : (
        <span className="text-zinc-400">— not tested</span>
      )}
    </div>
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Test notifications (Twilio / SendGrid)</h2>
      <p className="mt-1 text-xs text-zinc-400">
        Sends a test through the live providers. Leave a field blank to skip that
        channel. With the provider set to <code>console</code>, it &quot;succeeds&quot;
        by printing to the server logs instead of really sending.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Test mobile (+1 416 555 0123)"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Test email"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
        <button
          onClick={() => void run()}
          disabled={busy || (!phone.trim() && !email.trim())}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send test"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {res && (
        <div className="mt-3 space-y-1">
          <Line label="SMS" mode={res.smsMode} r={res.sms} />
          <Line label="Email" mode={res.emailMode} r={res.email} />
        </div>
      )}
    </div>
  );
}
