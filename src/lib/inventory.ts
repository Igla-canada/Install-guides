// Unit serial → Igla product adapter (open item #2 in the plan).
// v1 reads the internal InventoryUnit table (managed in /taxonomy).
// When the Igla portal exposes its inventory API, implement portalLookup()
// and it will take precedence — the resolve logic doesn't change.
import { prisma } from "./db";
import type { IglaProduct, ProductLine } from "@prisma/client";

export type ResolvedProduct = IglaProduct & { productLine: ProductLine };

export async function productFromSerial(
  serial: string
): Promise<ResolvedProduct | null> {
  const fromPortal = await portalLookup(serial);
  if (fromPortal) return fromPortal;

  const unit = await prisma.inventoryUnit.findUnique({
    where: { serial: serial.trim() },
    include: { iglaProduct: { include: { productLine: true } } },
  });
  return unit?.iglaProduct ?? null;
}

async function portalLookup(_serial: string): Promise<ResolvedProduct | null> {
  // TODO(open-item-2): call the Igla portal inventory API when it exists.
  return null;
}
