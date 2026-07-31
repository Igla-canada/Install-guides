import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const existing = await prisma.textBlockPreset.findUnique({ where: { id } });
  if (!existing)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const preset = await prisma.textBlockPreset.update({
    where: { id },
    data: {
      ...(parsed.data.label !== undefined
        ? { label: parsed.data.label.trim() }
        : {}),
      ...(parsed.data.html !== undefined ? { html: parsed.data.html } : {}),
      ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
      ...(parsed.data.sortOrder !== undefined
        ? { sortOrder: parsed.data.sortOrder }
        : {}),
    },
  });
  return NextResponse.json({ preset });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const { id } = await ctx.params;
  await prisma.textBlockPreset.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
