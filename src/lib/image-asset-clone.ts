// Clone ImageAsset rows (S3 object + annotations) so duplicated guides don't
// share annotation data. Annotations live on ImageAsset, not on the guild.
import { randomBytes } from "crypto";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { BUCKET, ensureBucket, s3 } from "./s3";

type GuildDocForAssetClone = {
  coverImageId: string | null;
  sections: Array<{
    blocks: Array<{ content: unknown }>;
  }>;
};

function newS3KeyFrom(sourceKey: string): string {
  const ext =
    sourceKey.includes(".")
      ? sourceKey.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)
      : "bin";
  return `images/${new Date().toISOString().slice(0, 10)}/${randomBytes(12).toString("hex")}.${ext || "bin"}`;
}

/** Every image/file asset id referenced by a guild document. */
export function collectAssetIdsFromGuildDoc(doc: GuildDocForAssetClone): Set<string> {
  const ids = new Set<string>();
  if (doc.coverImageId) ids.add(doc.coverImageId);
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      collectAssetIdsFromContent(block.content, ids);
    }
  }
  return ids;
}

function collectAssetIdsFromContent(content: unknown, ids: Set<string>) {
  if (!content || typeof content !== "object") return;
  const c = content as Record<string, unknown>;
  if (typeof c.imageAssetId === "string" && c.imageAssetId) ids.add(c.imageAssetId);
  if (typeof c.assetId === "string" && c.assetId) ids.add(c.assetId);
  if (Array.isArray(c.items)) {
    for (const item of c.items) {
      if (item && typeof item === "object") {
        const imageAssetId = (item as { imageAssetId?: string }).imageAssetId;
        if (imageAssetId) ids.add(imageAssetId);
      }
    }
  }
}

/** Deep-clone block JSON, swapping asset ids using the provided map. */
export function remapAssetIdsInContent(
  content: unknown,
  assetMap: ReadonlyMap<string, string>,
): unknown {
  if (!content || typeof content !== "object") return content;
  const c = content as Record<string, unknown>;
  const next: Record<string, unknown> = { ...c };
  if (typeof c.imageAssetId === "string" && assetMap.has(c.imageAssetId)) {
    next.imageAssetId = assetMap.get(c.imageAssetId);
  }
  if (typeof c.assetId === "string" && assetMap.has(c.assetId)) {
    next.assetId = assetMap.get(c.assetId);
  }
  if (Array.isArray(c.items)) {
    next.items = c.items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = item as { imageAssetId?: string; caption?: string };
      if (row.imageAssetId && assetMap.has(row.imageAssetId)) {
        return { ...row, imageAssetId: assetMap.get(row.imageAssetId) };
      }
      return item;
    });
  }
  return next;
}

/** Copy S3 bytes + DB row + annotations; returns the new ImageAsset id. */
export async function cloneImageAsset(
  sourceId: string,
  uploadedById?: string,
): Promise<string> {
  const source = await prisma.imageAsset.findUnique({
    where: { id: sourceId },
    include: { annotations: { orderBy: { order: "asc" } } },
  });
  if (!source) throw new Error(`image asset not found: ${sourceId}`);

  const s3Key = newS3KeyFrom(source.s3Key);
  await ensureBucket();
  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${source.s3Key}`,
      Key: s3Key,
      ContentType: source.mime,
    }),
  );

  const copy = await prisma.imageAsset.create({
    data: {
      s3Key,
      mime: source.mime,
      width: source.width,
      height: source.height,
      view: source.view ?? undefined,
      size: source.size,
      // Forked copies are per-guide — not library entries.
      libraryName: null,
      uploadedById: uploadedById ?? source.uploadedById,
      annotations: {
        create: source.annotations.map((a, i) => ({
          shape: a.shape,
          coords: a.coords as Prisma.InputJsonValue,
          label: a.label,
          description: a.description,
          color: a.color,
          order: a.order ?? i,
        })),
      },
    },
  });
  return copy.id;
}

/** Clone every referenced asset; returns oldId → newId (skips empty sets). */
export async function cloneImageAssetsForGuildCopy(
  doc: GuildDocForAssetClone,
  actorUserId: string,
): Promise<Map<string, string>> {
  const assetMap = new Map<string, string>();
  for (const oldId of collectAssetIdsFromGuildDoc(doc)) {
    assetMap.set(oldId, await cloneImageAsset(oldId, actorUserId));
  }
  return assetMap;
}

/**
 * In-place fix for guides that still share ImageAssets with another guide
 * (e.g. duplicated before asset forking). Clones every referenced asset and
 * rewrites this guild's cover + block content to point at the copies.
 */
export async function detachGuildImageAssets(
  guildId: string,
  actorUserId: string,
): Promise<{ cloned: number }> {
  const doc = await prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { blocks: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!doc) throw new Error("guild not found");

  const assetMap = await cloneImageAssetsForGuildCopy(doc, actorUserId);
  if (assetMap.size === 0) return { cloned: 0 };

  const newCover =
    doc.coverImageId && assetMap.has(doc.coverImageId)
      ? assetMap.get(doc.coverImageId)!
      : doc.coverImageId;

  await prisma.$transaction(async (tx) => {
    await tx.guild.update({
      where: { id: guildId },
      data: { coverImageId: newCover, updatedById: actorUserId },
    });
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        const remapped = remapAssetIdsInContent(block.content, assetMap);
        if (remapped !== block.content) {
          await tx.block.update({
            where: { id: block.id },
            data: { content: remapped as Prisma.InputJsonValue },
          });
        }
      }
    }
  });

  revalidatePath("/guides");
  revalidatePath(`/guides/${guildId}`);
  revalidatePath(`/guides/${guildId}/edit`);

  return { cloned: assetMap.size };
}
