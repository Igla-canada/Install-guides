// Client-side interaction tracking for installer views (zoom bursts, blocked
// shortcuts). Actor is resolved from the grant session or installer login —
// the client cannot spoof someone else's identity.
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, requestMeta } from "@/lib/auth";
import { currentGrant } from "@/lib/grant-auth";
import { logEvent } from "@/lib/audit";

const schema = z.object({
  guildId: z.string(),
  action: z.enum(["image_zoom", "open_section", "denied"]),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const grant = await currentGrant();
  const user = grant ? null : await currentUser();
  if (!grant && !user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const meta = await requestMeta();
  await logEvent({
    actor: grant ? { grantId: grant.id } : { userId: user!.id },
    guildId: parsed.data.guildId,
    action: parsed.data.action,
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: parsed.data.meta as never,
  });
  return NextResponse.json({ ok: true });
}
