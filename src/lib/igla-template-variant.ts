import type { FlasherVariant } from "./igla-flasher-packs";

export type TemplateVariant = FlasherVariant;

export function normalizeTemplateVariant(
  raw: unknown,
): TemplateVariant {
  return raw === "old" ? "old" : "current";
}

export function templateVariantLabel(variant: TemplateVariant): string {
  return variant === "old" ? "Old flasher" : "Current flasher";
}
