// THE canonical guild document + its operations layer.
//
// INVARIANT (see AGENTS.md #2): the preview editor and the chat editor are two
// surfaces over this ONE module. Every edit — from either surface — is an
// operation dispatched here. Neither surface keeps its own copy of the
// document. If you are adding an editing capability, add an operation here and
// call it from both surfaces; do not mutate guild rows anywhere else.
import { z } from "zod";
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Operation schemas
// ---------------------------------------------------------------------------

export const identitySchema = z.object({
  title: z.string().min(1).optional(),
  regionId: z.string().optional(),
  makeId: z.string().optional(),
  modelId: z.string().optional(),
  generationId: z.string().optional(),
  trimId: z.string().nullable().optional(),
  iglaProductId: z.string().optional(),
});

export const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update_identity"), data: identitySchema }),
  // Adjust THIS guild's generation (shared taxonomy row): rename or set its
  // year range so it reflects the real model years. yearEnd null = open-ended
  // ("now") — the Igla resolve API stops matching past yearEnd when it's set.
  z.object({
    op: z.literal("update_generation"),
    name: z.string().min(1).optional(),
    yearStart: z.number().int().optional(),
    yearEnd: z.number().int().nullable().optional(),
  }),
  z.object({ op: z.literal("update_properties"), properties: z.record(z.string(), z.string()) }),
  z.object({ op: z.literal("set_cover"), imageAssetId: z.string().nullable() }),
  z.object({
    op: z.literal("add_section"),
    title: z.string().min(1),
    type: z.string().default("custom"),
    afterSectionId: z.string().optional(),
    sectionId: z.string().optional(), // client-supplied id for offline/optimistic flows
  }),
  z.object({
    op: z.literal("update_section"),
    sectionId: z.string(),
    title: z.string().optional(),
    type: z.string().optional(),
    collapsedDefault: z.boolean().optional(),
  }),
  z.object({ op: z.literal("move_section"), sectionId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({ op: z.literal("delete_section"), sectionId: z.string() }),
  z.object({
    op: z.literal("add_block"),
    sectionId: z.string(),
    type: z.string(),
    content: z.unknown(),
    afterBlockId: z.string().optional(),
    blockId: z.string().optional(),
  }),
  z.object({ op: z.literal("update_block"), blockId: z.string(), content: z.unknown() }),
  z.object({
    op: z.literal("move_block"),
    blockId: z.string(),
    toSectionId: z.string().optional(),
    toIndex: z.number().int().min(0),
  }),
  z.object({ op: z.literal("delete_block"), blockId: z.string() }),
]);

export type GuildOp = z.infer<typeof opSchema>;

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export async function applyOps(
  guildId: string,
  ops: GuildOp[],
  actorUserId: string
): Promise<void> {
  // Sequential within a transaction: ops from one dispatch are atomic.
  await prisma.$transaction(async (tx) => {
    for (const op of ops) {
      await applyOne(tx, guildId, op);
    }
    await tx.guild.update({
      where: { id: guildId },
      data: { updatedById: actorUserId },
    });
  });
}

type Tx = Prisma.TransactionClient;

async function applyOne(tx: Tx, guildId: string, op: GuildOp): Promise<void> {
  switch (op.op) {
    case "update_identity": {
      const { trimId, ...rest } = op.data;
      await tx.guild.update({
        where: { id: guildId },
        data: { ...rest, ...(trimId !== undefined ? { trimId } : {}) },
      });
      return;
    }
    case "update_generation": {
      const guild = await tx.guild.findUniqueOrThrow({
        where: { id: guildId },
        select: { generationId: true },
      });
      await tx.generation.update({
        where: { id: guild.generationId },
        data: {
          ...(op.name !== undefined ? { name: op.name } : {}),
          ...(op.yearStart !== undefined ? { yearStart: op.yearStart } : {}),
          ...(op.yearEnd !== undefined ? { yearEnd: op.yearEnd } : {}),
        },
      });
      return;
    }
    case "update_properties":
      await tx.guild.update({
        where: { id: guildId },
        data: { properties: op.properties },
      });
      return;
    case "set_cover":
      await tx.guild.update({
        where: { id: guildId },
        data: { coverImageId: op.imageAssetId },
      });
      return;
    case "add_section": {
      const sections = await tx.section.findMany({
        where: { guildId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      let index = sections.length;
      if (op.afterSectionId) {
        const i = sections.findIndex((s) => s.id === op.afterSectionId);
        if (i >= 0) index = i + 1;
      }
      await shiftOrders(tx, "section", { guildId }, index);
      await tx.section.create({
        data: {
          ...(op.sectionId ? { id: op.sectionId } : {}),
          guildId,
          order: index,
          title: op.title,
          type: op.type ?? "custom",
        },
      });
      return;
    }
    case "update_section":
      await tx.section.update({
        where: { id: op.sectionId, guildId },
        data: {
          ...(op.title !== undefined ? { title: op.title } : {}),
          ...(op.type !== undefined ? { type: op.type } : {}),
          ...(op.collapsedDefault !== undefined
            ? { collapsedDefault: op.collapsedDefault }
            : {}),
        },
      });
      return;
    case "move_section": {
      const sections = await tx.section.findMany({
        where: { guildId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      const ids = sections.map((s) => s.id).filter((id) => id !== op.sectionId);
      ids.splice(Math.min(op.toIndex, ids.length), 0, op.sectionId);
      await Promise.all(
        ids.map((id, i) =>
          tx.section.update({ where: { id, guildId }, data: { order: i } })
        )
      );
      return;
    }
    case "delete_section":
      await tx.section.delete({ where: { id: op.sectionId, guildId } });
      return;
    case "add_block": {
      // Validate the section belongs to this guild.
      await tx.section.findFirstOrThrow({
        where: { id: op.sectionId, guildId },
        select: { id: true },
      });
      const blocks = await tx.block.findMany({
        where: { sectionId: op.sectionId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      let index = blocks.length;
      if (op.afterBlockId) {
        const i = blocks.findIndex((b) => b.id === op.afterBlockId);
        if (i >= 0) index = i + 1;
      }
      await shiftOrders(tx, "block", { sectionId: op.sectionId }, index);
      await tx.block.create({
        data: {
          ...(op.blockId ? { id: op.blockId } : {}),
          sectionId: op.sectionId,
          order: index,
          type: op.type,
          content: (op.content ?? {}) as Prisma.InputJsonValue,
        },
      });
      return;
    }
    case "update_block": {
      const block = await tx.block.findFirstOrThrow({
        where: { id: op.blockId, section: { guildId } },
        select: { id: true },
      });
      await tx.block.update({
        where: { id: block.id },
        data: { content: (op.content ?? {}) as Prisma.InputJsonValue },
      });
      return;
    }
    case "move_block": {
      const block = await tx.block.findFirstOrThrow({
        where: { id: op.blockId, section: { guildId } },
      });
      const targetSectionId = op.toSectionId ?? block.sectionId;
      await tx.section.findFirstOrThrow({
        where: { id: targetSectionId, guildId },
        select: { id: true },
      });
      const blocks = await tx.block.findMany({
        where: { sectionId: targetSectionId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      const ids = blocks.map((b) => b.id).filter((id) => id !== op.blockId);
      ids.splice(Math.min(op.toIndex, ids.length), 0, op.blockId);
      await tx.block.update({
        where: { id: op.blockId },
        data: { sectionId: targetSectionId },
      });
      await Promise.all(
        ids.map((id, i) =>
          tx.block.update({ where: { id }, data: { order: i } })
        )
      );
      return;
    }
    case "delete_block": {
      const block = await tx.block.findFirstOrThrow({
        where: { id: op.blockId, section: { guildId } },
        select: { id: true },
      });
      await tx.block.delete({ where: { id: block.id } });
      return;
    }
  }
}

async function shiftOrders(
  tx: Tx,
  table: "section" | "block",
  where: { guildId?: string; sectionId?: string },
  fromIndex: number
) {
  if (table === "section") {
    await tx.section.updateMany({
      where: { guildId: where.guildId, order: { gte: fromIndex } },
      data: { order: { increment: 1 } },
    });
  } else {
    await tx.block.updateMany({
      where: { sectionId: where.sectionId, order: { gte: fromIndex } },
      data: { order: { increment: 1 } },
    });
  }
}

// ---------------------------------------------------------------------------
// Load / snapshot / publish / rollback
// ---------------------------------------------------------------------------

export async function loadGuildDoc(guildId: string) {
  return prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      region: true,
      make: true,
      model: true,
      generation: true,
      trim: true,
      iglaProduct: { include: { productLine: true } },
      coverImage: true,
      sections: {
        orderBy: { order: "asc" },
        include: {
          blocks: { orderBy: { order: "asc" } },
        },
      },
    },
  });
}

export type GuildDoc = NonNullable<Awaited<ReturnType<typeof loadGuildDoc>>>;

export function snapshotOf(doc: GuildDoc): Prisma.InputJsonValue {
  return {
    identity: {
      regionId: doc.regionId,
      makeId: doc.makeId,
      modelId: doc.modelId,
      generationId: doc.generationId,
      trimId: doc.trimId,
      iglaProductId: doc.iglaProductId,
      title: doc.title,
    },
    coverImageId: doc.coverImageId,
    properties: doc.properties as object | null,
    sections: doc.sections.map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      type: s.type,
      collapsedDefault: s.collapsedDefault,
      blocks: s.blocks.map((b) => ({
        id: b.id,
        order: b.order,
        type: b.type,
        content: b.content as object,
      })),
    })),
  };
}

export class PublishConflictError extends Error {
  constructor(public conflictingGuildId: string, public conflictingTitle: string) {
    super("another published guild exists for this identity");
  }
}

/** Publish: enforce one-published-guild-per-identity, then snapshot a version. */
export async function publishGuild(
  guildId: string,
  actorUserId: string,
  note?: string
) {
  const doc = await loadGuildDoc(guildId);
  if (!doc) throw new Error("guild not found");

  const conflict = await prisma.guild.findFirst({
    where: {
      id: { not: guildId },
      status: "PUBLISHED",
      makeId: doc.makeId,
      modelId: doc.modelId,
      generationId: doc.generationId,
      trimId: doc.trimId,
      iglaProductId: doc.iglaProductId,
      regionId: doc.regionId,
    },
  });
  if (conflict) throw new PublishConflictError(conflict.id, conflict.title);

  const last = await prisma.guildVersion.findFirst({
    where: { guildId },
    orderBy: { versionNo: "desc" },
  });
  const versionNo = (last?.versionNo ?? 0) + 1;
  const version = await prisma.guildVersion.create({
    data: {
      guildId,
      versionNo,
      snapshot: snapshotOf(doc),
      note,
      createdById: actorUserId,
    },
  });
  await prisma.guild.update({
    where: { id: guildId },
    data: { status: "PUBLISHED", currentVersionId: version.id },
  });
  return version;
}

/**
 * Duplicate a guild into a new DRAFT — same identity, properties, cover and the
 * full section/block structure — so a similar guide can be built consistently
 * without rebuilding the scaffold. Photos/files are referenced (not re-uploaded);
 * replace a photo in the copy and it points at a fresh asset. The copy starts as
 * a DRAFT titled "Copy of …"; change its identity before publishing (one
 * published guild per identity is still enforced at publish time).
 */
export async function duplicateGuild(
  guildId: string,
  actorUserId: string
): Promise<string> {
  const doc = await loadGuildDoc(guildId);
  if (!doc) throw new Error("guild not found");

  const copy = await prisma.guild.create({
    data: {
      regionId: doc.regionId,
      makeId: doc.makeId,
      modelId: doc.modelId,
      generationId: doc.generationId,
      trimId: doc.trimId,
      iglaProductId: doc.iglaProductId,
      title: `Copy of ${doc.title}`,
      status: "DRAFT",
      coverImageId: doc.coverImageId,
      properties: (doc.properties ?? undefined) as Prisma.InputJsonValue | undefined,
      createdById: actorUserId,
      updatedById: actorUserId,
      sections: {
        create: doc.sections.map((s) => ({
          order: s.order,
          title: s.title,
          type: s.type,
          collapsedDefault: s.collapsedDefault,
          blocks: {
            create: s.blocks.map((b) => ({
              order: b.order,
              type: b.type,
              content: b.content as Prisma.InputJsonValue,
            })),
          },
        })),
      },
    },
  });
  return copy.id;
}

/** Restore the editable document from a version snapshot (the doc stays canonical). */
export async function rollbackGuild(
  guildId: string,
  versionNo: number,
  actorUserId: string
) {
  const version = await prisma.guildVersion.findUnique({
    where: { guildId_versionNo: { guildId, versionNo } },
  });
  if (!version) throw new Error("version not found");
  const snap = version.snapshot as {
    identity: Record<string, string | null>;
    coverImageId: string | null;
    properties: object | null;
    sections: Array<{
      order: number;
      title: string;
      type: string;
      collapsedDefault: boolean;
      blocks: Array<{ order: number; type: string; content: object }>;
    }>;
  };

  await prisma.$transaction(async (tx) => {
    await tx.section.deleteMany({ where: { guildId } });
    await tx.guild.update({
      where: { id: guildId },
      data: {
        title: (snap.identity.title as string) ?? undefined,
        coverImageId: snap.coverImageId,
        properties: (snap.properties ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        updatedById: actorUserId,
      },
    });
    for (const s of snap.sections) {
      await tx.section.create({
        data: {
          guildId,
          order: s.order,
          title: s.title,
          type: s.type,
          collapsedDefault: s.collapsedDefault,
          blocks: {
            create: s.blocks.map((b) => ({
              order: b.order,
              type: b.type,
              content: b.content as Prisma.InputJsonValue,
            })),
          },
        },
      });
    }
  });
}
