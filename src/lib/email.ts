// Pluggable email provider for sending installer access links.
// EMAIL_PROVIDER=console  -> emails are printed to the server console (dev).
// EMAIL_PROVIDER=sendgrid -> real email via SendGrid v3 REST API.
// The SendGrid adapter uses plain fetch — no SDK dependency. Set:
//   SENDGRID_API_KEY  — an API key with "Mail Send" permission
//   EMAIL_FROM        — a VERIFIED sender (single-sender or a domain you auth'd)
//   EMAIL_FROM_NAME   — optional display name (defaults to "Igla Guides")

export interface EmailProvider {
  send(to: string, subject: string, text: string, html?: string): Promise<void>;
}

const consoleProvider: EmailProvider = {
  async send(to, subject, text) {
    console.log(`[EMAIL:console] to=${to} subject="${subject}"\n${text}`);
  },
};

const sendgridProvider: EmailProvider = {
  async send(to, subject, text, html) {
    const key = process.env.SENDGRID_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) {
      throw new Error("SendGrid is not configured (SENDGRID_API_KEY / EMAIL_FROM missing)");
    }
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: process.env.EMAIL_FROM_NAME || "Igla Guides" },
        subject,
        content: [
          { type: "text/plain", value: text },
          ...(html ? [{ type: "text/html", value: html }] : []),
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SendGrid send failed (${res.status}): ${body}`);
    }
  },
};

export function emailProvider(): EmailProvider {
  return process.env.EMAIL_PROVIDER === "sendgrid" ? sendgridProvider : consoleProvider;
}

/** Compose + send the "here is your installation-guide access link" email. */
export async function sendAccessLinkEmail(opts: {
  to: string;
  granteeLabel: string;
  link: string;
  expiresAt: Date;
}): Promise<void> {
  const subject = "Your Igla installation guide access link";
  const text =
    `Hi ${opts.granteeLabel},\n\n` +
    `Here is your access link for the Igla installation guide:\n${opts.link}\n\n` +
    `When you open it, a one-time code is texted to your phone to verify it's you. ` +
    `Access is personal, view-only, and expires ${opts.expiresAt.toLocaleString()}.\n\n` +
    `Igla Guides`;
  const html =
    `<p>Hi ${escapeHtml(opts.granteeLabel)},</p>` +
    `<p>Here is your access link for the Igla installation guide:</p>` +
    `<p><a href="${opts.link}">${opts.link}</a></p>` +
    `<p>When you open it, a one-time code is texted to your phone to verify it's you. ` +
    `Access is personal, view-only, and expires ${escapeHtml(opts.expiresAt.toLocaleString())}.</p>` +
    `<p>Igla Guides</p>`;
  await emailProvider().send(opts.to, subject, text, html);
}

/** Compose + send the password reset link for staff/installer accounts. */
export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  link: string;
  expiresAt: Date;
}): Promise<void> {
  const subject = "Reset your Igla Guides password";
  const text =
    `Hi ${opts.name},\n\n` +
    `We received a request to reset your Igla Guides password.\n` +
    `Open this link to choose a new password:\n${opts.link}\n\n` +
    `The link expires ${opts.expiresAt.toLocaleString()} and can only be used once.\n` +
    `If you didn't request this, you can ignore this email.\n\n` +
    `Igla Guides`;
  const html =
    `<p>Hi ${escapeHtml(opts.name)},</p>` +
    `<p>We received a request to reset your Igla Guides password.</p>` +
    `<p><a href="${opts.link}">Choose a new password</a></p>` +
    `<p style="word-break:break-all"><a href="${opts.link}">${escapeHtml(opts.link)}</a></p>` +
    `<p>The link expires ${escapeHtml(opts.expiresAt.toLocaleString())} and can only be used once. ` +
    `If you didn't request this, you can ignore this email.</p>` +
    `<p>Igla Guides</p>`;
  await emailProvider().send(opts.to, subject, text, html);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
