// Pluggable SMS provider for installer one-time codes.
// SMS_PROVIDER=console  -> codes are printed to the server console (dev).
// SMS_PROVIDER=twilio   -> real SMS via Twilio REST API (set TWILIO_* in env).
// The Twilio adapter uses plain fetch — no SDK dependency.

export interface SmsProvider {
  send(toPhone: string, body: string): Promise<void>;
}

const consoleProvider: SmsProvider = {
  async send(toPhone, body) {
    console.log(`[SMS:console] to=${toPhone} body="${body}"`);
  },
};

const twilioProvider: SmsProvider = {
  async send(toPhone, body) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw new Error("Twilio is not configured (TWILIO_* env vars missing)");
    }
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: toPhone, From: from, Body: body }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio send failed (${res.status}): ${text}`);
    }
  },
};

export function smsProvider(): SmsProvider {
  return process.env.SMS_PROVIDER === "twilio"
    ? twilioProvider
    : consoleProvider;
}
