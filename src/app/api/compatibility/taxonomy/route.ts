// GET /api/compatibility/taxonomy — makes + simplified model names for
// cascading dropdowns in external apps. Same Bearer service token as
// /api/compatibility.
import { NextRequest, NextResponse } from "next/server";
import { checkServiceToken } from "@/lib/service-auth";
import { listCompatibilityTaxonomy } from "@/lib/vehicle-compatibility";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const taxonomy = await listCompatibilityTaxonomy({ visibleOnly: true });
  return NextResponse.json(taxonomy);
}
