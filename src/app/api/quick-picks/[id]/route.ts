import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const patchSchema = z.object({
  label: z.string().min(1).optional(),
  scope: z.enum(["personal", "org", "per_make"]).optional(),
  makeId: z.string().nullable().optional(),
  payload: z.unknown().optional(),
});

async function editableOrThrow(pickId: string, userId: string, role: string) {
  const pick = await prisma.quickPick.findUnique({ where: { id: pickId } });
  if (!pick) return null;
  const canEdit =
    role === "ADMIN" || pick.ownerId === userId || pick.scope === "org";
  if (!canEdit) return "forbidden" as const;
  return pick;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const { id } = await ctx.params;
  const pick = await editableOrThrow(id, user.id, user.role);
  if (pick === null)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (pick === "forbidden")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const data = parsed.data;
  const updated = await prisma.quickPick.update({
    where: { id },
    data: {
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.scope !== undefined ? { scope: data.scope } : {}),
      ...(data.makeId !== undefined
        ? { makeId: data.scope === "per_make" ? data.makeId : null }
        : data.scope !== undefined && data.scope !== "per_make"
          ? { makeId: null }
          : {}),
      ...(data.payload !== undefined
        ? { payload: data.payload as Prisma.InputJsonValue }
        : {}),
    },
  });
  return NextResponse.json({
    id: updated.id,
    scope: updated.scope,
    kind: updated.kind,
    label: updated.label,
    payload: updated.payload,
    useCount: updated.useCount,
  });
}
