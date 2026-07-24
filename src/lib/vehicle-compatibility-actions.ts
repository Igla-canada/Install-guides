"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  findLikelyDuplicates,
  parseCompatibilityForm,
  validateCompatibility,
} from "@/lib/vehicle-compatibility";

function revalidateCompat() {
  revalidatePath("/users");
  revalidatePath("/compatibility");
  revalidatePath("/dealer/compatibility");
}

export async function createCompatibilityRecord(formData: FormData) {
  await requireRole("ADMIN");
  const force = formData.get("force") === "1";
  const parsed = validateCompatibility(parseCompatibilityForm(formData));
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  if (!force) {
    const dupes = await findLikelyDuplicates(parsed.data);
    if (dupes.length) {
      return {
        ok: false as const,
        error: "duplicate",
        duplicates: dupes.map((d) => ({
          id: d.id,
          make: d.make,
          model: d.model,
          yearFrom: d.yearFrom,
          yearTo: d.yearTo,
          trim: d.trim,
        })),
      };
    }
  }

  await prisma.vehicleCompatibility.create({ data: parsed.data });
  revalidateCompat();
  return { ok: true as const };
}

export async function updateCompatibilityRecord(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "Missing record id." };
  const force = formData.get("force") === "1";
  const parsed = validateCompatibility(parseCompatibilityForm(formData));
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  if (!force) {
    const dupes = await findLikelyDuplicates(parsed.data, id);
    if (dupes.length) {
      return {
        ok: false as const,
        error: "duplicate",
        duplicates: dupes.map((d) => ({
          id: d.id,
          make: d.make,
          model: d.model,
          yearFrom: d.yearFrom,
          yearTo: d.yearTo,
          trim: d.trim,
        })),
      };
    }
  }

  // Writes ONLY to VehicleCompatibility — never touches Guild / guide tables.
  await prisma.vehicleCompatibility.update({
    where: { id },
    data: parsed.data,
  });
  revalidateCompat();
  return { ok: true as const };
}

export async function deleteCompatibilityRecord(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "Missing record id." };
  await prisma.vehicleCompatibility.delete({ where: { id } });
  revalidateCompat();
  return { ok: true as const };
}

export async function toggleCompatibilityVisibility(formData: FormData) {
  await requireRole("ADMIN", "TECH");
  const id = String(formData.get("id") ?? "");
  const row = await prisma.vehicleCompatibility.findUnique({ where: { id } });
  if (!row) return { ok: false as const, error: "Not found." };
  await prisma.vehicleCompatibility.update({
    where: { id },
    data: { isVisibleToDealers: !row.isVisibleToDealers },
  });
  revalidateCompat();
  return { ok: true as const };
}

/** Set dealer visibility for one or many compatibility rows (never touches guides). */
export async function setCompatibilityVisibilityBulk(
  ids: string[],
  visible: boolean,
) {
  await requireRole("ADMIN", "TECH");
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return { ok: false as const, error: "No rows selected." };

  await prisma.vehicleCompatibility.updateMany({
    where: { id: { in: unique } },
    data: { isVisibleToDealers: visible },
  });
  revalidateCompat();
  return { ok: true as const, count: unique.length, visible };
}
