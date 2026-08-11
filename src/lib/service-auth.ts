// Bearer service-token auth for the Igla portal → Guides app integration calls
// (GET /api/guild/resolve, POST /api/guild/issue, GET /api/compatibility).
// Accepts the env-configured token or any non-revoked DB-managed ServiceToken.
import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "./db";

/**
 * Pull the token out of an Authorization header.
 *
 * The scheme is matched case-insensitively because RFC 7235 says it is
 * case-insensitive — clients legitimately send "bearer". Quotes and stray
 * whitespace are tolerated for the same reason: a config file that wrapped the
 * value in quotes should not read as a bad credential.
 */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^\s*bearer\s+(.+)\s*$/i.exec(header);
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "") || null;
}

export async function checkServiceToken(req: NextRequest): Promise<boolean> {
  const token = parseBearer(req.headers.get("authorization"));
  return token ? isValidServiceToken(token) : false;
}

/** Why a request was refused — surfaced in the 401 body so it's debuggable. */
export type AuthFailure = "no_credential" | "bad_scheme" | "unknown_token";

export async function diagnoseServiceToken(
  header: string | null,
): Promise<{ ok: true } | { ok: false; reason: AuthFailure }> {
  if (!header?.trim()) return { ok: false, reason: "no_credential" };
  const token = parseBearer(header);
  if (!token) return { ok: false, reason: "bad_scheme" };
  return (await isValidServiceToken(token))
    ? { ok: true }
    : { ok: false, reason: "unknown_token" };
}

/**
 * Validate a bare token string.
 *
 * Split out for the MCP endpoint: ChatGPT's connector UI only offers "no auth"
 * or full OAuth, so that route carries the token in the URL path instead of an
 * Authorization header. Same tokens, same revocation.
 */
export async function isValidServiceToken(raw: string): Promise<boolean> {
  const token = raw.trim();
  if (!token) return false;
  if (process.env.IGLA_SERVICE_TOKEN && token === process.env.IGLA_SERVICE_TOKEN) {
    return true;
  }
  const hash = createHash("sha256").update(token).digest("hex");
  const row = await prisma.serviceToken.findUnique({ where: { tokenHash: hash } });
  return Boolean(row && !row.revokedAt);
}
