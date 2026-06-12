// GET /api/guild/resolve — called by the Igla portal/app during its install
// wizard. Authenticated with a service bearer token (npm run token:service).
// Query params: vin, make, model, year, serial, installer (label for audit).
// Returns { match, candidates, diagnostics }; the app shows candidates when
// ambiguous and then opens the guide via its own grant/installer flow.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { resolveGuild } from "@/lib/resolve";
import { logEvent } from "@/lib/audit";

async function checkServiceToken(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  // Env-configured token (simple deployments)…
  if (process.env.IGLA_SERVICE_TOKEN && token === process.env.IGLA_SERVICE_TOKEN) {
    return true;
  }
  // …or DB-managed tokens (revocable).
  const hash = createHash("sha256").update(token).digest("hex");
  const row = await prisma.serviceToken.findUnique({ where: { tokenHash: hash } });
  return Boolean(row && !row.revokedAt);
}

export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const yearRaw = sp.get("year");
  const input = {
    vin: sp.get("vin") ?? undefined,
    make: sp.get("make") ?? undefined,
    model: sp.get("model") ?? undefined,
    year: yearRaw ? parseInt(yearRaw, 10) || undefined : undefined,
    serial: sp.get("serial") ?? undefined,
  };
  if (!input.vin && !input.make && !input.model) {
    return NextResponse.json(
      { error: "provide at least vin or make/model" },
      { status: 400 }
    );
  }

  const result = await resolveGuild(input);

  await logEvent({
    actor: null,
    action: "resolve",
    guildId: result.match?.guildId ?? null,
    meta: {
      installer: sp.get("installer"),
      input: { ...input, vin: input.vin ? `…${input.vin.slice(-6)}` : undefined },
      matched: Boolean(result.match),
      candidateCount: result.candidates.length,
      diagnostics: result.diagnostics,
    },
  });

  return NextResponse.json(result);
}
