// Client mirror of the server ops semantics (src/lib/guild-doc.ts) used ONLY
// for optimistic/offline rendering. The server doc is authoritative: whenever
// a dispatch succeeds, the returned doc replaces local state. Keep the two in
// step when adding operations.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ClientDoc, ClientSection } from "./types";

export function applyOpsLocal(doc: ClientDoc, ops: any[]): ClientDoc {
  let next: ClientDoc = structuredClone(doc);
  for (const op of ops) next = applyOne(next, op);
  return next;
}

function reindex<T extends { order: number }>(arr: T[]): T[] {
  return arr.map((x, i) => ({ ...x, order: i }));
}

function applyOne(doc: ClientDoc, op: any): ClientDoc {
  switch (op.op) {
    case "update_identity":
      return { ...doc, ...op.data };
    case "update_properties":
      return { ...doc, properties: op.properties };
    case "set_cover":
      return { ...doc, coverImageId: op.imageAssetId };
    case "add_section": {
      const sections = [...doc.sections];
      let index = sections.length;
      if (op.afterSectionId) {
        const i = sections.findIndex((s) => s.id === op.afterSectionId);
        if (i >= 0) index = i + 1;
      }
      const sec: ClientSection = {
        id: op.sectionId ?? `local-${crypto.randomUUID()}`,
        order: index,
        title: op.title,
        type: op.type ?? "custom",
        collapsedDefault: false,
        blocks: [],
      };
      sections.splice(index, 0, sec);
      return { ...doc, sections: reindex(sections) };
    }
    case "update_section":
      return {
        ...doc,
        sections: doc.sections.map((s) =>
          s.id === op.sectionId
            ? {
                ...s,
                ...(op.title !== undefined ? { title: op.title } : {}),
                ...(op.type !== undefined ? { type: op.type } : {}),
                ...(op.collapsedDefault !== undefined
                  ? { collapsedDefault: op.collapsedDefault }
                  : {}),
              }
            : s
        ),
      };
    case "move_section": {
      const sections = [...doc.sections];
      const i = sections.findIndex((s) => s.id === op.sectionId);
      if (i < 0) return doc;
      const [sec] = sections.splice(i, 1);
      sections.splice(Math.min(op.toIndex, sections.length), 0, sec);
      return { ...doc, sections: reindex(sections) };
    }
    case "delete_section":
      return {
        ...doc,
        sections: reindex(doc.sections.filter((s) => s.id !== op.sectionId)),
      };
    case "add_block": {
      return {
        ...doc,
        sections: doc.sections.map((s) => {
          if (s.id !== op.sectionId) return s;
          const blocks = [...s.blocks];
          let index = blocks.length;
          if (op.afterBlockId) {
            const i = blocks.findIndex((b) => b.id === op.afterBlockId);
            if (i >= 0) index = i + 1;
          }
          blocks.splice(index, 0, {
            id: op.blockId ?? `local-${crypto.randomUUID()}`,
            order: index,
            type: op.type,
            content: op.content ?? {},
          });
          return { ...s, blocks: reindex(blocks) };
        }),
      };
    }
    case "update_block":
      return {
        ...doc,
        sections: doc.sections.map((s) => ({
          ...s,
          blocks: s.blocks.map((b) =>
            b.id === op.blockId ? { ...b, content: op.content } : b
          ),
        })),
      };
    case "move_block": {
      let moved: any = null;
      const stripped = doc.sections.map((s) => {
        const i = s.blocks.findIndex((b) => b.id === op.blockId);
        if (i < 0) return s;
        moved = s.blocks[i];
        return { ...s, blocks: reindex(s.blocks.filter((b) => b.id !== op.blockId)) };
      });
      if (!moved) return doc;
      const targetId =
        op.toSectionId ??
        doc.sections.find((s) => s.blocks.some((b) => b.id === op.blockId))?.id;
      return {
        ...doc,
        sections: stripped.map((s) => {
          if (s.id !== targetId) return s;
          const blocks = [...s.blocks];
          blocks.splice(Math.min(op.toIndex, blocks.length), 0, moved);
          return { ...s, blocks: reindex(blocks) };
        }),
      };
    }
    case "delete_block":
      return {
        ...doc,
        sections: doc.sections.map((s) => ({
          ...s,
          blocks: reindex(s.blocks.filter((b) => b.id !== op.blockId)),
        })),
      };
    default:
      return doc;
  }
}
