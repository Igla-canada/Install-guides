// Staff + installer-account authentication.
// Sessions are random tokens stored hashed in the DB and carried in an
// httpOnly cookie — revocable server-side at any moment (unlike pure JWTs).
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { UserAccount, UserRole } from "@prisma/client";

export const SESSION_COOKIE = "igla_session";
const SESSION_TTL_HOURS = 12;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null,
    userAgent: h.get("user-agent") ?? null,
  };
}

export async function login(
  email: string,
  password: string
): Promise<{ user: UserAccount; token: string } | null> {
  const user = await prisma.userAccount.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user || user.status !== "ACTIVE") return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  const token = newToken();
  const meta = await requestMeta();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600_000),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  return { user, token };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<UserAccount | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  return session.user;
}

/** Throws a redirect-worthy error if no user or wrong role. Use in server actions/APIs. */
export async function requireRole(
  ...roles: UserRole[]
): Promise<UserAccount> {
  const user = await currentUser();
  if (!user) throw new AuthError("not_authenticated");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new AuthError("forbidden");
  }
  return user;
}

export class AuthError extends Error {
  constructor(public code: "not_authenticated" | "forbidden") {
    super(code);
  }
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export { SESSION_TTL_HOURS };
