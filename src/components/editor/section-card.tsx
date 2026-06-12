"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import type { ClientQuickPick, ClientSection } from "./types";
import BlockCard from "./block-card";
import { BLOCK_TYPES, SECTION_TYPES, defaultContent, sectionAccent } from "@/lib/blocks";

export default function SectionCard({
  section,
  index,
  total,
  guildId,
  dispatch,
  quickPicks,
}: {
  section: ClientSection;
  index: number;
  total: number;
  guildId: string;
  dispatch: (ops: any[]) => Promise<void>;
  quickPicks: ClientQuickPick[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const sectionPicks = quickPicks.filter(
    (p) => p.kind === "block_template" || p.kind === "text_value"
  );

  const addBlock = (type: string) => {
    setAddOpen(false);
    void dispatch([
      {
        op: "add_block",
        blockId: crypto.randomUUID(),
        sectionId: section.id,
        type,
        content: defaultContent(type),
      },
    ]);
  };

  const insertPick = (pick: ClientQuickPick) => {
    setAddOpen(false);
    const ops =
      pick.kind === "text_value"
        ? [
            {
              op: "add_block",
              blockId: crypto.randomUUID(),
              sectionId: section.id,
              type: "text",
              content: { text: String(pick.payload?.text ?? "") },
            },
          ]
        : [
            {
              op: "add_block",
              blockId: crypto.randomUUID(),
              sectionId: section.id,
              type: String(pick.payload?.type ?? "text"),
              content: pick.payload?.content ?? {},
            },
          ];
    void dispatch(ops);
    void fetch(`/api/quick-picks/${pick.id}/use`, { method: "POST" });
  };

  const saveAsQuickPick = async () => {
    const label = window.prompt(
      "Save this whole section as a quick pick. Label:",
      section.title
    );
    if (!label) return;
    await fetch("/api/quick-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "org",
        kind: "section_template",
        label,
        payload: {
          title: section.title,
          type: section.type,
          blocks: section.blocks.map((b) => ({ type: b.type, content: b.content })),
        },
      }),
    });
    alert("Saved. It will appear in quick picks next time the editor loads.");
  };

  return (
    <div
      className={`rounded-xl border border-zinc-200 border-l-4 bg-white ${sectionAccent(
        section.type
      )}`}
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-zinc-400 hover:text-zinc-600"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        <input
          defaultValue={section.title}
          onBlur={(e) => {
            if (e.target.value !== section.title) {
              void dispatch([
                { op: "update_section", sectionId: section.id, title: e.target.value },
              ]);
            }
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-lg font-semibold focus:outline-none"
        />
        <select
          value={section.type}
          onChange={(e) =>
            void dispatch([
              { op: "update_section", sectionId: section.id, type: e.target.value },
            ])
          }
          className="rounded-md border border-zinc-200 bg-white px-1 py-0.5 text-xs text-zinc-500"
          title="Section style"
        >
          {SECTION_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 items-center text-zinc-400">
          <IconBtn
            label="Move up"
            disabled={index === 0}
            onClick={() =>
              void dispatch([
                { op: "move_section", sectionId: section.id, toIndex: index - 1 },
              ])
            }
          >
            ↑
          </IconBtn>
          <IconBtn
            label="Move down"
            disabled={index >= total - 1}
            onClick={() =>
              void dispatch([
                { op: "move_section", sectionId: section.id, toIndex: index + 1 },
              ])
            }
          >
            ↓
          </IconBtn>
          <IconBtn label="Save section as quick pick" onClick={() => void saveAsQuickPick()}>
            ☆
          </IconBtn>
          <IconBtn
            label="Delete section"
            onClick={() => {
              if (confirm(`Delete section "${section.title}" and its blocks?`)) {
                void dispatch([{ op: "delete_section", sectionId: section.id }]);
              }
            }}
          >
            🗑
          </IconBtn>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-3 border-t border-zinc-100 p-4">
          {section.blocks.map((block, bi) => (
            <BlockCard
              key={block.id}
              block={block}
              index={bi}
              total={section.blocks.length}
              sectionId={section.id}
              guildId={guildId}
              dispatch={dispatch}
            />
          ))}

          <div className="relative">
            <button
              onClick={() => setAddOpen((v) => !v)}
              className="w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
            >
              + Add block
            </button>
            {addOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {BLOCK_TYPES.map((t) => (
                    <button
                      key={t.type}
                      onClick={() => addBlock(t.type)}
                      className="rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {sectionPicks.length > 0 && (
                  <>
                    <div className="mt-2 border-t border-zinc-100 px-2 pt-2 text-xs font-medium uppercase text-zinc-400">
                      Quick picks
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {sectionPicks.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => insertPick(p)}
                          className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-zinc-100"
                        >
                          ☆ {p.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="rounded px-1.5 py-0.5 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
