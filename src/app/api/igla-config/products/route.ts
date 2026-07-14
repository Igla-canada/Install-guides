// Igla settings templates are keyed by product (unit type). This lists the
// products an admin can hold a template for, plus whether each already has one —
// used by the Admin → Igla settings tab and by the block add-flow's unit picker.
//
//  GET — list IGLA-line products + hasTemplate (ADMIN + TECH; tech reads to add
//        a settings block, admin manages templates).
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { asConfigDoc } from "@/lib/igla-config";

export async function GET() {
  try {
    await requireRole("ADMIN", "TECH");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
  const products = await prisma.iglaProduct.findMany({
    orderBy: [{ productLine: { name: "asc" } }, { name: "asc" }],
    include: { productLine: true, configTemplate: true },
  });
  return NextResponse.json({
    products: products.map((p) => {
      const doc = p.configTemplate ? asConfigDoc(p.configTemplate.doc) : null;
      return {
        id: p.id,
        name: p.name,
        line: p.productLine.name,
        hasTemplate: Boolean(p.configTemplate),
        sectionCount: doc?.sections.length ?? 0,
      };
    }),
  });
}
