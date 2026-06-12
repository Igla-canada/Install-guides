"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState } from "react";
import type { ClientBlock } from "./types";
import ImageBlockEditor from "@/components/images/image-block-editor";
import { uploadImage } from "@/lib/client/offline";

export default function BlockCard({
  block,
  index,
  total,
  sectionId,
  dispatch,
}: {
  block: ClientBlock;
  index: number;
  total: number;
  sectionId: string;
  guildId: string;
  dispatch: (ops: any[]) => Promise<void>;
}) {
  const update = (content: any) =>
    void dispatch([{ op: "update_block", blockId: block.id, content }]);

  return (
    <div className="group relative rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
      <div className="absolute -top-2.5 right-2 hidden items-center gap-1 rounded-md border border-zinc-200 bg-white px-1 text-xs text-zinc-400 group-hover:flex">
        <span className="px-1 uppercase">{block.type.replaceAll("_", " ")}</span>
        <button
          disabled={index === 0}
          onClick={() =>
            void dispatch([{ op: "move_block", blockId: block.id, toIndex: index - 1 }])
          }
          className="px-1 py-0.5 hover:text-zinc-700 disabled:opacity-30"
          title="Move up"
        >
          ↑
        </button>
        <button
          disabled={index >= total - 1}
          onClick={() =>
            void dispatch([{ op: "move_block", blockId: block.id, toIndex: index + 1 }])
          }
          className="px-1 py-0.5 hover:text-zinc-700 disabled:opacity-30"
          title="Move down"
        >
          ↓
        </button>
        <button
          onClick={() => {
            if (confirm("Delete this block?")) {
              void dispatch([{ op: "delete_block", blockId: block.id }]);
            }
          }}
          className="px-1 py-0.5 hover:text-red-600"
          title="Delete block"
        >
          ✕
        </button>
      </div>
      <BlockBody block={block} update={update} sectionId={sectionId} />
    </div>
  );
}

function BlockBody({
  block,
  update,
}: {
  block: ClientBlock;
  update: (content: any) => void;
  sectionId: string;
}) {
  const c = block.content ?? {};
  switch (block.type) {
    case "text":
      return (
        <textarea
          defaultValue={c.text ?? ""}
          onBlur={(e) => {
            if (e.target.value !== c.text) update({ ...c, text: e.target.value });
          }}
          placeholder="Write…"
          rows={Math.max(2, String(c.text ?? "").split("\n").length)}
          className="w-full resize-y border-0 bg-transparent text-sm focus:outline-none"
        />
      );

    case "connections_table": {
      type Row = { name: string; location: string; color: string; pin: string; note: string };
      const rows: Row[] = c.rows ?? [];
      const setRows = (next: Row[]) => update({ ...c, rows: next });
      const cols: Array<{ key: keyof Row; label: string; w: string }> = [
        { key: "name", label: "", w: "w-28" },
        { key: "location", label: "Location", w: "flex-1" },
        { key: "color", label: "Color", w: "w-24" },
        { key: "pin", label: "Pin", w: "w-14" },
        { key: "note", label: "Note", w: "flex-1" },
      ];
      return (
        <div className="overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="flex gap-1 px-1 text-xs font-medium uppercase text-zinc-400">
              {cols.map((col) => (
                <span key={col.key} className={col.w}>
                  {col.label}
                </span>
              ))}
              <span className="w-5" />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="mt-1 flex gap-1">
                {cols.map((col) => (
                  <input
                    key={col.key}
                    defaultValue={r[col.key]}
                    placeholder={col.key === "name" ? "e.g. CAN-H" : col.label}
                    onBlur={(e) => {
                      if (e.target.value !== r[col.key])
                        setRows(
                          rows.map((x, j) =>
                            j === i ? { ...x, [col.key]: e.target.value } : x
                          )
                        );
                    }}
                    className={`${col.w} rounded border border-zinc-200 bg-white px-2 py-1 text-sm ${
                      col.key === "name" ? "font-semibold" : ""
                    }`}
                  />
                ))}
                <button
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  className="w-5 text-zinc-300 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setRows([...rows, { name: "", location: "", color: "", pin: "", note: "" }])
              }
              className="mt-1 text-xs text-zinc-400 hover:text-zinc-600"
            >
              + connection
            </button>
          </div>
        </div>
      );
    }

    case "key_value_table": {
      const rows: Array<{ key: string; value: string }> = c.rows ?? [];
      const setRows = (next: typeof rows) => update({ ...c, rows: next });
      return (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input
                defaultValue={r.key}
                placeholder="Name"
                onBlur={(e) => {
                  if (e.target.value !== r.key)
                    setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)));
                }}
                className="w-1/3 rounded border border-zinc-200 bg-white px-2 py-1 text-sm font-medium"
              />
              <input
                defaultValue={r.value}
                placeholder="Value"
                onBlur={(e) => {
                  if (e.target.value !== r.value)
                    setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)));
                }}
                className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
              />
              <button
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="text-zinc-300 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setRows([...rows, { key: "", value: "" }])}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            + row
          </button>
        </div>
      );
    }

    case "image":
    case "annotated_image":
      return (
        <ImageBlockEditor
          content={c}
          annotatable={block.type === "annotated_image"}
          onChange={update}
        />
      );

    case "gallery": {
      const items: Array<{ imageAssetId: string; caption?: string }> = c.items ?? [];
      return (
        <ImageBlockEditor
          content={{ gallery: true, items }}
          annotatable={false}
          onChange={(next: any) => update({ ...c, items: next.items })}
        />
      );
    }

    case "checklist": {
      const items: Array<{ text: string; checked: boolean }> = c.items ?? [];
      const setItems = (next: typeof items) => update({ ...c, items: next });
      return (
        <div className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={it.checked}
                onChange={(e) =>
                  setItems(items.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))
                }
              />
              <input
                defaultValue={it.text}
                placeholder="Item…"
                onBlur={(e) => {
                  if (e.target.value !== it.text)
                    setItems(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)));
                }}
                className="flex-1 border-0 bg-transparent text-sm focus:outline-none"
              />
              <button
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="text-zinc-300 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setItems([...items, { text: "", checked: false }])}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            + item
          </button>
        </div>
      );
    }

    case "callout": {
      const styles: Record<string, string> = {
        info: "bg-blue-50 border-blue-200",
        warning: "bg-amber-50 border-amber-200",
        danger: "bg-red-50 border-red-200",
      };
      return (
        <div className={`rounded-md border p-3 ${styles[c.style] ?? styles.warning}`}>
          <select
            value={c.style ?? "warning"}
            onChange={(e) => update({ ...c, style: e.target.value })}
            className="mb-1 rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs"
          >
            <option value="info">ℹ Info</option>
            <option value="warning">⚠ Warning</option>
            <option value="danger">⛔ Danger</option>
          </select>
          <textarea
            defaultValue={c.text ?? ""}
            onBlur={(e) => {
              if (e.target.value !== c.text) update({ ...c, text: e.target.value });
            }}
            placeholder="Important note…"
            rows={2}
            className="w-full resize-y border-0 bg-transparent text-sm focus:outline-none"
          />
        </div>
      );
    }

    case "code_value":
      return (
        <div className="flex gap-2">
          <input
            defaultValue={c.label ?? ""}
            placeholder="Label (e.g. Service code)"
            onBlur={(e) => {
              if (e.target.value !== c.label) update({ ...c, label: e.target.value });
            }}
            className="w-1/3 rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
          />
          <input
            defaultValue={c.value ?? ""}
            placeholder="Value"
            onBlur={(e) => {
              if (e.target.value !== c.value) update({ ...c, value: e.target.value });
            }}
            className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-sm"
          />
        </div>
      );

    case "file":
      return <FileBlockEditor content={c} update={update} />;

    case "divider":
      return <hr className="border-zinc-200" />;

    default:
      // Forward compatibility: never crash on unknown block types.
      return (
        <p className="text-xs text-zinc-400">
          Unknown block type “{block.type}” — preserved as-is.
        </p>
      );
  }
}

// Firmware/settings file attachment (.bin etc.). Uploads through the same
// offline-tolerant queue as photos.
function FileBlockEditor({
  content: c,
  update,
}: {
  content: any;
  update: (content: any) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { assetId } = await uploadImage(file, file.name);
      update({ ...c, assetId, name: file.name, size: file.size });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <input ref={fileRef} type="file" hidden onChange={(e) => void handle(e.target.files)} />
      {c.assetId ? (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
          <span className="text-lg">📄</span>
          <input
            defaultValue={c.name ?? "file"}
            onBlur={(e) => {
              if (e.target.value !== c.name) update({ ...c, name: e.target.value });
            }}
            className="min-w-0 flex-1 truncate border-0 bg-transparent font-medium focus:outline-none"
          />
          {typeof c.size === "number" && (
            <span className="text-xs text-zinc-400">
              {c.size > 1048576
                ? `${(c.size / 1048576).toFixed(1)} MB`
                : `${Math.round(c.size / 1024)} KB`}
            </span>
          )}
          {String(c.assetId).startsWith("pending:") && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">
              waiting to sync
            </span>
          )}
          <button onClick={() => fileRef.current?.click()} className="text-xs text-zinc-400 hover:text-zinc-600">
            Replace
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 px-4 py-4 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
        >
          📄 {busy ? "Uploading…" : "Attach file (.bin, settings, …)"}
        </button>
      )}
    </div>
  );
}
