"use client";

import { useState } from "react";
import RichTextEditor from "@/components/editor/rich-text-editor";
import type { TextBlockPresetClient } from "@/lib/text-block-presets";

export default function TextPresetsManager({
  initial,
}: {
  initial: TextBlockPresetClient[];
}) {
  const [presets, setPresets] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  const save = async (p: TextBlockPresetClient) => {
    setBusyId(p.id);
    try {
      const r = await fetch(`/api/text-presets/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: p.label,
          html: p.html,
          text: p.text,
        }),
      });
      if (!r.ok) {
        alert("Could not save.");
        return;
      }
      const { preset } = await r.json();
      setPresets((list) => list.map((x) => (x.id === p.id ? preset : x)));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Delete preset "${label}"?`)) return;
    setBusyId(id);
    try {
      await fetch(`/api/text-presets/${id}`, { method: "DELETE" });
      setPresets((list) => list.filter((x) => x.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    const label = draftLabel.trim();
    if (!label) {
      alert("Give the preset a title (this is what appears in + Add block).");
      return;
    }
    setBusyId("new");
    try {
      const r = await fetch("/api/text-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          html: `<p><strong>${label.replace(/</g, "")}</strong></p><p></p>`,
          text: label,
        }),
      });
      if (!r.ok) {
        alert("Could not create.");
        return;
      }
      const { preset } = await r.json();
      setPresets((list) => [...list, preset]);
      setDraftLabel("");
    } finally {
      setBusyId(null);
    }
  };

  const updateLocal = (id: string, patch: Partial<TextBlockPresetClient>) => {
    setPresets((list) =>
      list.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">New preset</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Title shows in the guide editor under + Add block. After creating,
          edit the text below (bold, size, color, bullets — same tools as a
          guide text block).
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="e.g. Relay Connection"
            className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          />
          <button
            disabled={busyId === "new"}
            onClick={() => void create()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {presets.length === 0 && (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-400">
          No text presets yet. Add one above.
        </p>
      )}

      {presets.map((p) => (
        <div
          key={p.id}
          className="rounded-xl border border-zinc-200 bg-white p-4"
        >
          <label className="block text-xs font-medium text-zinc-600">
            Title in + Add block
            <input
              value={p.label}
              onChange={(e) => updateLocal(p.id, { label: e.target.value })}
              className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm font-medium"
            />
          </label>
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-zinc-600">
              Preset text
            </p>
            <RichTextEditor
              html={p.html}
              text={p.text}
              onChange={(next) =>
                updateLocal(p.id, { html: next.html, text: next.text })
              }
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busyId === p.id}
              onClick={() => void save(p)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 disabled:opacity-50"
            >
              {busyId === p.id ? "Saving…" : "Save changes"}
            </button>
            <button
              disabled={busyId === p.id}
              onClick={() => void remove(p.id, p.label)}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
