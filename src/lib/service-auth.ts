// Bearer service-token auth for the Igla portal → Guides app integration calls
// (GET /api/guild/resolve, POST /api/guild/issue). Accepts the env-configured
// token or any non-revoked DB-managed ServiceToken.
import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "./db";

export async function checkServiceToken(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  if (!token) return false;
  if (process.env.IGLA_SERVICE_TOKEN && token === process.env.IGLA_SERVICE_TOKEN) {
    return true;
  }
  const hash = createHash("sha256").update(token).digest("hex");
  const row = await prisma.serviceToken.findUnique({ where: { tokenHash: hash } });
  return Boolean(row && !row.revokedAt);
}
