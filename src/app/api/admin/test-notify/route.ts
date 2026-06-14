// Admin-only config tester: fire a test SMS and/or email through the SAME
// providers the access-link flow uses, and report per-channel success or the
// raw provider error. Lets an admin verify Twilio / SendGrid env without having
// to publish a guide and run the whole grant flow.
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { smsProvider } from "@/lib/sms";
import { emailProvider } from "@/lib/email";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { phone, email } = (await req.json().catch(() => ({}))) as {
    phone?: string;
    email?: string;
  };

  const result: {
    smsMode: string;
    emailMode: string;
    sms?: { ok: boolean; error?: string };
    email?: { ok: boolean; error?: string };
  } = {
    smsMode: process.env.SMS_PROVIDER ?? "console",
    emailMode: process.env.EMAIL_PROVIDER ?? "console",
  };

  if (phone?.trim()) {
    try {
      await smsProvider().send(
        phone.trim(),
        "Igla Guides: test message — your SMS (Twilio) setup works."
      );
      result.sms = { ok: true };
    } catch (e) {
      result.sms = { ok: false, error: (e as Error).message };
    }
  }

  if (email?.trim()) {
    try {
      await emailProvider().send(
        email.trim(),
        "Igla Guides — test email",
        "This is a test. Your email (SendGrid) setup works.",
        "<p>This is a test. Your email (SendGrid) setup works.</p>"
      );
      result.email = { ok: true };
    } catch (e) {
      result.email = { ok: false, error: (e as Error).message };
    }
  }

  return NextResponse.json(result);
}
