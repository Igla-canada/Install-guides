"use server";
// Taxonomy CRUD — admin/tech curated. This is the only place vehicle identity
// vocabulary is created; guild authoring and the resolve API consume it.
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

function str(formData: FormData, key: string): string {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`missing ${key}`);
  return v;
}

export async function addMake(formData: FormData) {
  await requireRole("ADMIN", "TECH");
  await prisma.make.create({ data: { name: str(formData, "name") } });
  revalidatePath("/taxonomy");
}

export async function addModel(formData: FormData) {
  await requireRole("ADMIN", "TECH");
  await prisma.model.create({
    data: { makeId: str(formData, "makeId"), name: str(formData, "name") },
  });
  revalidatePath("/taxonomy");
}

export async function addGeneration(formData: FormData) {
  await requireRole("ADMIN", "TECH");
  const yearEnd = String(formData.get("yearEnd") ?? "").trim();
  await prisma.generation.create({
    data: {
      modelId: str(formData, "modelId"),
      name: str(formData, "name"),
      yearStart: parseInt(str(formData, "yearStart"), 10),
      yearEnd: yearEnd ? parseInt(yearEnd, 10) : null,
    },
  });
  revalidatePath("/taxonomy");
}

export async function addTrim(formData: FormData) {
  await requireRole("ADMIN", "TECH");
  await prisma.trim.create({
    data: { generationId: str(formData, "generationId"), name: str(formData, "name") },
  });
  revalidatePath("/taxonomy");
}

export async function addAlias(formData: FormData) {
  await requireRole("ADMIN", "TECH");
  const modelId = String(formData.get("modelId") ?? "").trim();
  await prisma.vehicleAlias.create({
    data: {
      makeId: str(formData, "makeId"),
      modelId: modelId || null,
      aliasText: str(formData, "aliasText").toLowerCase(),
    },
  });
  revalidatePath("/taxonomy");
}

export async function addProduct(formData: FormData) {
  await requireRole("ADMIN", "TECH");
  await prisma.iglaProduct.create({
    data: {
      productLineId: str(formData, "productLineId"),
      name: str(formData, "name"),
      modelCode: String(formData.get("modelCode") ?? "").trim() || null,
    },
  });
  revalidatePath("/taxonomy");
}

export async function addInventoryUnit(formData: FormData) {
  await requireRole("ADMIN", "TECH");
  await prisma.inventoryUnit.create({
    data: {
      serial: str(formData, "serial"),
      iglaProductId: str(formData, "iglaProductId"),
    },
  });
  revalidatePath("/taxonomy");
}

export async function deleteEntity(formData: FormData) {
  await requireRole("ADMIN");
  const kind = str(formData, "kind");
  const id = str(formData, "id");
  switch (kind) {
    case "make":
      await prisma.make.delete({ where: { id } });
      break;
    case "model":
      await prisma.model.delete({ where: { id } });
      break;
    case "generation":
      await prisma.generation.delete({ where: { id } });
      break;
    case "trim":
      await prisma.trim.delete({ where: { id } });
      break;
    case "alias":
      await prisma.vehicleAlias.delete({ where: { id } });
      break;
    case "product":
      await prisma.iglaProduct.delete({ where: { id } });
      break;
    case "inventory":
      await prisma.inventoryUnit.delete({ where: { id } });
      break;
  }
  revalidatePath("/taxonomy");
}
