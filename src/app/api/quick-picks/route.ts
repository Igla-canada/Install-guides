import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const schema = z.object({
  scope: z.enum(["personal", "org", "per_make"]).default("personal"),
  makeId: z.string().optional(),
  kind: z.enum(["section_template", "block_template", "text_value", "settings_preset"]),
  label: z.string().min(1),
  payload: z.unknown(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const pick = await prisma.quickPick.create({
    data: {
      ownerId: user.id,
      scope: parsed.data.scope,
      makeId: parsed.data.scope === "per_make" ? parsed.data.makeId : null,
      kind: parsed.data.kind,
      label: parsed.data.label,
      payload: parsed.data.payload as Prisma.InputJsonValue,
    },
  });
  return NextResponse.json({ id: pick.id });
}
