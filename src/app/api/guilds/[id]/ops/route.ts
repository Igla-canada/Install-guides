// The single mutation endpoint for the guild document. Preview editor, chat
// surface, and the offline sync queue ALL post operations here — there is no
// other write path for guild content (AGENTS.md #2).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { applyOps, loadGuildDoc, opSchema } from "@/lib/guild-doc";

const bodySchema = z.object({ ops: z.array(opSchema).min(1) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.code }, { status: 401 });
    }
    throw e;
  }
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_ops", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    await applyOps(id, parsed.data.ops, user.id);
  } catch (e) {
    console.error("applyOps failed", e);
    return NextResponse.json({ error: "apply_failed" }, { status: 409 });
  }
  const doc = await loadGuildDoc(id);
  return NextResponse.json({ doc });
}
