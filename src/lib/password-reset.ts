import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { hashToken, newToken } from "./auth";
import { sendPasswordResetEmail } from "./email";
import { logEvent } from "./audit";
import type { UserAccount } from "@prisma/client";

export const RESET_TTL_HOURS = 1;
const MIN_PASSWORD_LEN = 8;

function resetBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

/** Create a reset token and email the link. Always resolves — never reveals whether the email exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return;

  const user = await prisma.userAccount.findUnique({ where: { email: normalized } });
  if (!user || user.status !== "ACTIVE") return;

  const rawToken = newToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 3600_000);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
      },
    }),
  ]);

  const link = `${resetBaseUrl()}/reset-password/${rawToken}`;
  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    link,
    expiresAt,
  });

  await logEvent({
    actor: { userId: user.id },
    action: "password_reset_requested",
  });
}

export async function verifyPasswordResetToken(
  rawToken: string
): Promise<UserAccount | null> {
  const token = rawToken.trim();
  if (!token) return null;

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.consumedAt || row.expiresAt < new Date()) return null;
  if (row.user.status !== "ACTIVE") return null;
  return row.user;
}

export async function completePasswordReset(
  rawToken: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const token = rawToken.trim();
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.consumedAt || row.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  if (row.user.status !== "ACTIVE") {
    return { ok: false, error: "This account is disabled." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  await prisma.$transaction([
    prisma.userAccount.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { consumedAt: now },
    }),
    prisma.session.deleteMany({ where: { userId: row.userId } }),
  ]);

  await logEvent({
    actor: { userId: row.userId },
    action: "password_reset_completed",
  });

  return { ok: true };
}
