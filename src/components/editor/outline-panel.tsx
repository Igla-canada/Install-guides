"use client";
// Layer / outline view of the guide: every section and the blocks inside it.
// Drag a section to reorder the page; drag a block to reorder it within its
// section or onto another section to move it there. Dispatches the same
// move_section / move_block ops the arrows on the cards use, so it stays in
// sync with the canonical document. Desktop drag-and-drop (native HTML5).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState } from "react";
import type { ClientBlock, ClientDoc } from "./types";

const BLOCK_LABELS: Record<string, string> = {
  text: "Text",
  rich_text: "Text",
  annotated_image: "Photo",
  image: "Photo",
  gallery: "Photos",
  connections_table: "Connections table",
  callout: "Callout",
  checklist: "Checklist",
  warning: "Warning",
  file: "File",
  file_text: "File + text",
  settings: "Settings",
  software: "Software",
  video: "Video",
};

function snippetOf(c: any): string {
  const raw =
    c?.heading ?? c?.caption ?? c?.title ?? c?.label ?? (typeof c?.text === "string" ? c.text : "") ?? "";
  return String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
}

function blockLabel(b: ClientBlock): string {
  const base = BLOCK_LABELS[b.type] ?? b.type.replace(/_/g, " ");
  const snip = snippetOf(b.content);
  return snip ? `${base} · ${snip}` : base;
}

type Drag = { kind: "section" | "block"; id: string; sectionId?: string } | null;

export default function OutlinePanel({
  doc,
  dispatch,
}: {
  doc: ClientDoc;
  dispatch: (ops: any[]) => Promise<void>;
}) {
  const drag = useRef<Drag>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const clear = () => {
    drag.current = null;
    setOverId(null);
  };

  // Drop onto a section: reorder sections, or move a dragged block to its end.
  const onSectionDrop = (targetSectionId: string) => {
    const d = drag.current;
    clear();
    if (!d) return;
    if (d.kind === "section") {
      if (d.id === targetSectionId) return;
      const ids = doc.sections.map((s) => s.id).filter((id) => id !== d.id);
      const toIndex = ids.indexOf(targetSectionId);
      if (toIndex < 0) return;
      void dispatch([{ op: "move_section", sectionId: d.id, toIndex }]);
    } else {
      const target = doc.sections.find((s) => s.id === targetSectionId);
      if (!target) return;
      const remaining = target.blocks.filter((b) => b.id !== d.id).length;
      void dispatch([{ op: "move_block", blockId: d.id, toSectionId: targetSectionId, toIndex: remaining }]);
    }
  };

  // Drop onto a block: insert the dragged block just before it (within or across
  // sections). Section drags ignore block targets.
  const onBlockDrop = (targetSectionId: string, targetBlockId: string) => {
    const d = drag.current;
    clear();
    if (!d || d.kind !== "block" || d.id === targetBlockId) return;
    const target = doc.sections.find((s) => s.id === targetSectionId);
    if (!target) return;
    const ids = target.blocks.map((b) => b.id).filter((id) => id !== d.id);
    const toIndex = ids.indexOf(targetBlockId);
    if (toIndex < 0) return;
    void dispatch([{ op: "move_block", blockId: d.id, toSectionId: targetSectionId, toIndex }]);
  };

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center px-4 py-2 text-left text-sm font-medium text-zinc-600"
      >
        Blocks &amp; section order
        <span className="ml-auto text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-200 p-3">
          <p className="text-xs text-zinc-400">
            Drag a section to reorder the page. Drag a block to move it within its
            section, or onto a section header to move it there.
          </p>
          {doc.sections.map((s) => (
            <div key={s.id} className="rounded-lg border border-zinc-200">
              <div
                draggable
                onDragStart={() => {
                  drag.current = { kind: "section", id: s.id };
                }}
                onDragEnd={clear}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(s.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onSectionDrop(s.id);
                }}
                className={`flex items-center gap-2 rounded-t-lg px-2 py-1.5 text-sm font-medium ${
                  overId === s.id ? "bg-amber-50 ring-1 ring-amber-300" : "bg-zinc-50"
                }`}
              >
                <span className="cursor-grab select-none text-zinc-400" title="Drag to reorder">
                  ⋮⋮
                </span>
                <span className="truncate">{s.title || "Untitled section"}</span>
                <span className="ml-auto text-xs text-zinc-400">{s.blocks.length}</span>
              </div>
              <div className="space-y-1 p-1.5">
                {s.blocks.length === 0 && (
                  <div className="px-2 py-1 text-xs text-zinc-300">No blocks</div>
                )}
                {s.blocks.map((b) => (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      drag.current = { kind: "block", id: b.id, sectionId: s.id };
                    }}
                    onDragEnd={clear}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOverId(b.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onBlockDrop(s.id, b.id);
                    }}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                      overId === b.id ? "border-amber-300 bg-amber-50" : "border-zinc-100 bg-white"
                    }`}
                  >
                    <span className="cursor-grab select-none text-zinc-300">⋮⋮</span>
                    <span className="truncate text-zinc-600">{blockLabel(b)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
