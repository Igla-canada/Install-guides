// Igla settings templates are keyed by product (unit type), with an optional
// "old" flasher variant for 231 / Alarm. This lists products an admin can hold
// a template for — used by Admin → Igla settings and the guide insert picker.
//
//  GET — list IGLA-line products + template status (ADMIN + TECH).
import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { asConfigDoc } from "@/lib/igla-config";
import { productHasOldFlasherPack } from "@/lib/igla-flasher-packs";

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
    include: { productLine: true, configTemplates: true },
  });
  return NextResponse.json({
    products: products.map((p) => {
      const current = p.configTemplates.find((t) => t.variant === "current");
      const old = p.configTemplates.find((t) => t.variant === "old");
      const currentDoc = current ? asConfigDoc(current.doc) : null;
      const oldDoc = old ? asConfigDoc(old.doc) : null;
      const supportsOld = productHasOldFlasherPack(p.name);
      return {
        id: p.id,
        name: p.name,
        line: p.productLine.name,
        supportsOldFlasher: supportsOld,
        hasTemplate: Boolean(current),
        sectionCount: currentDoc?.sections.length ?? 0,
        hasOldTemplate: Boolean(old),
        oldSectionCount: oldDoc?.sections.length ?? 0,
      };
    }),
  });
}
