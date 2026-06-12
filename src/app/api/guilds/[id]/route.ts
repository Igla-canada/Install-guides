import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { loadGuildDoc } from "@/lib/guild-doc";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.code }, { status: 401 });
    }
    throw e;
  }
  const { id } = await ctx.params;
  const doc = await loadGuildDoc(id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ doc });
}
