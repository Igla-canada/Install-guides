// Older Igla flashers use a different settings layout than current software.
// These packs are NOT separate products — they are alternate settings
// snapshots for IGLA 231 / IGLA Alarm when a vehicle still runs old firmware.
import type { IglaConfigDoc } from "./igla-config";
import { IGLA_231_DEFAULT } from "./igla-231-default";
import { IGLA_ALARM_DEFAULT } from "./igla-alarm-default";
import { IGLA_OLD_DEFAULT } from "./igla-old-default";
import { IGLA_ALARM_OLD_DEFAULT } from "./igla-alarm-old-default";

export type FlasherVariant = "current" | "old";

/** Products that have a dedicated older-flasher settings pack. */
export function productHasOldFlasherPack(productName: string): boolean {
  return is231Product(productName) || isAlarmProduct(productName);
}

export function is231Product(productName: string): boolean {
  return /\b231\b/i.test(productName);
}

export function isAlarmProduct(productName: string): boolean {
  const n = productName.trim().toLowerCase();
  return n === "igla alarm" || (n.includes("alarm") && !n.includes("old"));
}

/** Settings doc to snapshot for a product + flasher generation. */
export function flasherPackDoc(
  productName: string,
  variant: FlasherVariant,
): IglaConfigDoc | null {
  if (is231Product(productName)) {
    return variant === "old" ? IGLA_OLD_DEFAULT : IGLA_231_DEFAULT;
  }
  if (isAlarmProduct(productName)) {
    return variant === "old" ? IGLA_ALARM_OLD_DEFAULT : IGLA_ALARM_DEFAULT;
  }
  return null;
}

export function flasherVariantLabel(variant: FlasherVariant | undefined): string | null {
  if (variant === "old") return "Old flasher";
  if (variant === "current") return "Current flasher";
  return null;
}
