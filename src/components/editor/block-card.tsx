"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState } from "react";
import type { ClientBlock } from "./types";
import ImageBlockEditor from "@/components/images/image-block-editor";
import RichTextEditor from "./rich-text-editor";
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
        <RichTextEditor
          html={c.html}
          text={c.text}
          onChange={(next) => update({ ...c, html: next.html, text: next.text })}
        />
      );

    case "connections_table":
      return <ConnectionsTableEditor c={c} update={update} />;

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
      const columns: number = c.columns ?? 2;
      const layouts: Array<{ cols: number; label: string }> = [
        { cols: 1, label: "1 wide" },
        { cols: 2, label: "2 × grid" },
        { cols: 3, label: "3 × grid" },
        { cols: 4, label: "4 × grid" },
      ];
      return (
        <div>
          <div className="mb-2 flex items-center gap-1">
            <span className="mr-1 text-xs text-zinc-400">Layout:</span>
            {layouts.map((l) => (
              <button
                key={l.cols}
                onClick={() => update({ ...c, columns: l.cols })}
                className={`rounded-md px-2 py-1 text-xs ${
                  columns === l.cols
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <ImageBlockEditor
            content={{ gallery: true, items, columns }}
            annotatable={false}
            onChange={(next: any) => update({ ...c, items: next.items, columns })}
          />
        </div>
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
          <RichTextEditor
            html={c.html}
            text={c.text}
            onChange={(next) => update({ ...c, html: next.html, text: next.text })}
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

    case "file_text":
      return <FileTextBlockEditor content={c} update={update} />;

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

// File + text: ONE bordered box holding a description and the attachment, so
// the file reads as part of the text block (not a separate row below it).
type FileEntry = { assetId: string; name?: string; size?: number };

// A file_text block holds one description + ONE OR MORE files. Stored as
// `files: FileEntry[]`; older blocks used flat assetId/name/size — read either.
function fileTextEntries(c: any): FileEntry[] {
  if (Array.isArray(c?.files)) return c.files.filter((f: any) => f && f.assetId);
  if (c?.assetId) return [{ assetId: c.assetId, name: c.name, size: c.size }];
  return [];
}

function FileTextBlockEditor({
  content: c,
  update,
}: {
  content: any;
  update: (content: any) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceIdx = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);

  const files = fileTextEntries(c);

  // Always persist in the array shape; drop the legacy single-file keys.
  const writeFiles = (next: FileEntry[]) => {
    const { assetId: _a, name: _n, size: _s, ...rest } = c;
    update({ ...rest, files: next });
  };

  const handle = async (list: FileList | null) => {
    const picked = list ? Array.from(list) : [];
    if (!picked.length) return;
    setBusy(true);
    try {
      const uploaded: FileEntry[] = [];
      for (const file of picked) {
        const { assetId } = await uploadImage(file, file.name);
        uploaded.push({ assetId, name: file.name, size: file.size });
      }
      if (replaceIdx.current != null) {
        const next = files.slice();
        next[replaceIdx.current] = uploaded[0];
        writeFiles(next);
      } else {
        writeFiles([...files, ...uploaded]);
      }
    } finally {
      setBusy(false);
      replaceIdx.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const rename = (i: number, name: string) => {
    if (name === files[i]?.name) return;
    const next = files.slice();
    next[i] = { ...next[i], name };
    writeFiles(next);
  };

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" hidden multiple onChange={(e) => void handle(e.target.files)} />
      <RichTextEditor
        html={c.html}
        text={c.text}
        onChange={(next) => update({ ...c, html: next.html, text: next.text })}
      />
      <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-white p-2">
        {files.map((f, i) => (
          <div
            key={f.assetId}
            className="flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
          >
            <span className="text-lg">📄</span>
            <input
              defaultValue={f.name ?? "file"}
              onBlur={(e) => rename(i, e.target.value)}
              className="min-w-0 flex-1 truncate border-0 bg-transparent font-medium focus:outline-none"
            />
            {typeof f.size === "number" && (
              <span className="text-xs text-zinc-400">
                {f.size > 1048576
                  ? `${(f.size / 1048576).toFixed(1)} MB`
                  : `${Math.round(f.size / 1024)} KB`}
              </span>
            )}
            {String(f.assetId).startsWith("pending:") && (
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">
                waiting to sync
              </span>
            )}
            <button
              onClick={() => {
                replaceIdx.current = i;
                fileRef.current?.click();
              }}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Replace
            </button>
            <button
              onClick={() => writeFiles(files.filter((_, j) => j !== i))}
              className="text-xs text-zinc-300 hover:text-red-500"
              title="Remove file"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            replaceIdx.current = null;
            fileRef.current?.click();
          }}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 px-4 py-2.5 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
        >
          📎 {busy ? "Uploading…" : files.length ? "Attach another file" : "Attach file (.bin, settings, …)"}
        </button>
      </div>
    </div>
  );
}

// Connections table: editable rows with a drag handle to reorder them. Inputs
// stay uncontrolled (commit on blur), so after a reorder/delete we bump a nonce
// to remount the rows and refresh their defaultValues to the new order.
type ConnRow = { name: string; location: string; color: string; pin: string; note: string };

function ConnectionsTableEditor({
  c,
  update,
}: {
  c: any;
  update: (content: any) => void;
}) {
  const rows: ConnRow[] = c.rows ?? [];
  const setRows = (next: ConnRow[]) => update({ ...c, rows: next });
  const cols: Array<{ key: keyof ConnRow; label: string; w: string }> = [
    { key: "name", label: "", w: "w-28" },
    { key: "location", label: "Location", w: "flex-1" },
    { key: "color", label: "Color", w: "w-24" },
    { key: "pin", label: "Pin", w: "w-14" },
    { key: "note", label: "Note", w: "flex-1" },
  ];
  const [nonce, setNonce] = useState(0);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next);
    setNonce((n) => n + 1);
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        <div className="flex gap-1 px-1 text-xs font-medium uppercase text-zinc-400">
          <span className="w-5" />
          {cols.map((col) => (
            <span key={col.key} className={col.w}>
              {col.label}
            </span>
          ))}
          <span className="w-5" />
        </div>
        {rows.map((r, i) => (
          <div
            key={`${nonce}-${i}`}
            className={`mt-1 flex items-center gap-1 rounded ${
              overIndex === i ? "ring-2 ring-zinc-400" : ""
            }`}
            onDragOver={(e) => {
              if (dragIndex.current === null) return;
              e.preventDefault();
              if (overIndex !== i) setOverIndex(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex.current !== null) reorder(dragIndex.current, i);
              dragIndex.current = null;
              setOverIndex(null);
            }}
          >
            <span
              draggable
              onDragStart={(e) => {
                dragIndex.current = i;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i)); // Firefox needs data to start a drag
              }}
              onDragEnd={() => {
                dragIndex.current = null;
                setOverIndex(null);
              }}
              title="Drag to reorder"
              className="w-5 shrink-0 cursor-grab select-none text-center text-zinc-300 hover:text-zinc-600 active:cursor-grabbing"
            >
              ⠿
            </span>
            {cols.map((col) => (
              <input
                key={col.key}
                defaultValue={r[col.key]}
                placeholder={col.key === "name" ? "e.g. CAN-H" : col.label}
                onBlur={(e) => {
                  if (e.target.value !== r[col.key])
                    setRows(rows.map((x, j) => (j === i ? { ...x, [col.key]: e.target.value } : x)));
                }}
                className={`${col.w} rounded border border-zinc-200 bg-white px-2 py-1 text-sm ${
                  col.key === "name" ? "font-semibold" : ""
                }`}
              />
            ))}
            <button
              onClick={() => {
                setRows(rows.filter((_, j) => j !== i));
                setNonce((n) => n + 1);
              }}
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
