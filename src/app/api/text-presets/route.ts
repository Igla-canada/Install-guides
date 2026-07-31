import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  label: z.string().min(1).max(120),
  html: z.string().default(""),
  text: z.string().default(""),
});

export async function GET() {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const presets = await prisma.textBlockPreset.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return NextResponse.json({ presets });
}

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const max = await prisma.textBlockPreset.aggregate({
    _max: { sortOrder: true },
  });
  const preset = await prisma.textBlockPreset.create({
    data: {
      label: parsed.data.label.trim(),
      html: parsed.data.html,
      text: parsed.data.text,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json({ preset });
}
