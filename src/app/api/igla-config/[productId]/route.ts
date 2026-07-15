// One product's Igla-settings template.
//
//  GET    — the template doc, or an empty doc if none yet (ADMIN + TECH: tech
//           reads it to snapshot into a guide's igla_settings block).
//  PUT    — replace the template doc (ADMIN only).
//  DELETE — clear the template (ADMIN only). The product stays in the catalog;
//           guides that already embedded a snapshot keep their frozen copy.
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { asConfigDoc, emptyDoc, isIglaConfigDoc } from "@/lib/igla-config";
import type { Prisma } from "@prisma/client";

async function guard(...roles: ("ADMIN" | "TECH")[]) {
  try {
    await requireRole(...roles);
    return null;
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const denied = await guard("ADMIN", "TECH");
  if (denied) return denied;
  const { productId } = await params;
  const product = await prisma.iglaProduct.findUnique({
    where: { id: productId },
    include: { configTemplate: true, productLine: true },
  });
  if (!product)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    productId: product.id,
    productName: product.name,
    line: product.productLine.name,
    doc: product.configTemplate ? asConfigDoc(product.configTemplate.doc) : emptyDoc(),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const denied = await guard("ADMIN");
  if (denied) return denied;
  const { productId } = await params;
  const body = await req.json().catch(() => null);
  if (!isIglaConfigDoc(body?.doc))
    return NextResponse.json({ error: "invalid_doc" }, { status: 400 });
  const product = await prisma.iglaProduct.findUnique({ where: { id: productId } });
  if (!product)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const doc = body.doc as Prisma.InputJsonValue;
  await prisma.iglaConfigTemplate.upsert({
    where: { iglaProductId: productId },
    create: { iglaProductId: productId, doc },
    update: { doc },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const denied = await guard("ADMIN");
  if (denied) return denied;
  const { productId } = await params;
  // Clears only the template. The product stays; guides that already embedded a
  // snapshot are untouched (frozen copies). No-op if there's no template.
  await prisma.iglaConfigTemplate
    .delete({ where: { iglaProductId: productId } })
    .catch(() => null);
  return NextResponse.json({ ok: true });
}
