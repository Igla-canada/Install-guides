// One product's Igla-settings template (optionally a flasher variant).
//
// Query: ?variant=current|old  (default current)
//
//  GET    — the template doc, or an empty doc if none yet (ADMIN + TECH: tech
//           reads it to snapshot into a guide's igla_settings block). For the
//           "old" variant on 231/Alarm, seeds the transcribed pack on first
//           read so it is immediately editable like any other template.
//  PUT    — replace the template doc (ADMIN only).
//  PATCH  — append a Car configuration option from a guide editor (ADMIN).
//           Always targets the "current" flasher template.
//  DELETE — clear this variant's template (ADMIN only). The product stays;
//           guides that already embedded a snapshot keep their frozen copy.
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  appendCarConfigurationToDoc,
  asConfigDoc,
  emptyDoc,
  isIglaConfigDoc,
} from "@/lib/igla-config";
import {
  flasherPackDoc,
  productHasOldFlasherPack,
} from "@/lib/igla-flasher-packs";
import { normalizeTemplateVariant } from "@/lib/igla-template-variant";
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

function variantFromUrl(req: Request) {
  const url = new URL(req.url);
  return normalizeTemplateVariant(url.searchParams.get("variant"));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const denied = await guard("ADMIN", "TECH");
  if (denied) return denied;
  const { productId } = await params;
  const variant = variantFromUrl(req);
  const product = await prisma.iglaProduct.findUnique({
    where: { id: productId },
    include: {
      productLine: true,
      configTemplates: { where: { variant } },
    },
  });
  if (!product)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (variant === "old" && !productHasOldFlasherPack(product.name)) {
    return NextResponse.json({ error: "variant_not_supported" }, { status: 400 });
  }

  let row = product.configTemplates[0] ?? null;

  // First open of "old" on 231/Alarm — seed the transcribed pack so admins can
  // edit it on the same page as the current template.
  if (!row && variant === "old") {
    const pack = flasherPackDoc(product.name, "old");
    if (pack) {
      const doc = structuredClone(pack) as Prisma.InputJsonValue;
      row = await prisma.iglaConfigTemplate.create({
        data: { iglaProductId: productId, variant: "old", doc },
      });
    }
  }

  return NextResponse.json({
    productId: product.id,
    productName: product.name,
    line: product.productLine.name,
    variant,
    doc: row ? asConfigDoc(row.doc) : emptyDoc(),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const denied = await guard("ADMIN");
  if (denied) return denied;
  const { productId } = await params;
  const variant = variantFromUrl(req);
  const body = await req.json().catch(() => null);
  if (!isIglaConfigDoc(body?.doc))
    return NextResponse.json({ error: "invalid_doc" }, { status: 400 });
  const product = await prisma.iglaProduct.findUnique({
    where: { id: productId },
  });
  if (!product)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (variant === "old" && !productHasOldFlasherPack(product.name)) {
    return NextResponse.json({ error: "variant_not_supported" }, { status: 400 });
  }
  const doc = body.doc as Prisma.InputJsonValue;
  await prisma.iglaConfigTemplate.upsert({
    where: {
      iglaProductId_variant: { iglaProductId: productId, variant },
    },
    create: { iglaProductId: productId, variant, doc },
    update: { doc },
  });
  return NextResponse.json({ ok: true, variant });
}

/**
 * Append one Car configuration label from a guide editor onto the product's
 * current-flasher template list. Idempotent.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const denied = await guard("ADMIN");
  if (denied) return denied;
  const { productId } = await params;
  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label)
    return NextResponse.json({ error: "label_required" }, { status: 400 });

  const product = await prisma.iglaProduct.findUnique({
    where: { id: productId },
    include: {
      configTemplates: { where: { variant: "current" } },
    },
  });
  if (!product)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const row = product.configTemplates[0] ?? null;
  const current = row ? asConfigDoc(row.doc) : emptyDoc();
  const { doc, option, added } = appendCarConfigurationToDoc(current, label);
  if (!option) {
    return NextResponse.json(
      { error: "car_configuration_missing" },
      { status: 400 },
    );
  }

  if (added) {
    const json = doc as Prisma.InputJsonValue;
    await prisma.iglaConfigTemplate.upsert({
      where: {
        iglaProductId_variant: {
          iglaProductId: productId,
          variant: "current",
        },
      },
      create: { iglaProductId: productId, variant: "current", doc: json },
      update: { doc: json },
    });
  }

  return NextResponse.json({ ok: true, added, option });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const denied = await guard("ADMIN");
  if (denied) return denied;
  const { productId } = await params;
  const variant = variantFromUrl(req);
  // Clears only this variant's template. Guides that already embedded a
  // snapshot are untouched (frozen copies). No-op if there's no row.
  await prisma.iglaConfigTemplate
    .delete({
      where: {
        iglaProductId_variant: { iglaProductId: productId, variant },
      },
    })
    .catch(() => null);
  return NextResponse.json({ ok: true, variant });
}
