"use client";
// Files-library manager (admin). Uploads go DIRECT to S3 via a presigned PUT so
// big files (up to 100 MB) don't hit the serverless request-body limit; once the
// object is in S3 we record it as a library file. Lists + deletes + downloads.
import { useMemo, useState } from "react";

type LibFile = {
  id: string;
  name: string;
  size: number | null;
  mime: string;
  createdAt: string;
};

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

function fmtSize(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export default function FilesManager({ initial }: { initial: LibFile[] }) {
  const [files, setFiles] = useState<LibFile[]>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const allSelected = useMemo(
    () => files.length > 0 && files.every((f) => selected.has(f.id)),
    [files, selected],
  );
  const someSelected = useMemo(
    () => files.some((f) => selected.has(f.id)) && !allSelected,
    [files, selected, allSelected],
  );

  const refresh = async () => {
    const res = await fetch("/api/files/library");
    if (res.ok) setFiles((await res.json()).files);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`That file is ${fmtSize(file.size)} — the limit is 100 MB.`);
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const mime = file.type || "application/octet-stream";
      const pres = await fetch("/api/images/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mime, name: file.name }),
      });
      if (!pres.ok) throw new Error("Could not start the upload.");
      const { uploadUrl, s3Key } = await pres.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", mime);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable)
            setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(
                new Error(
                  `Upload failed (S3 ${xhr.status}). Check S3 CORS allows PUT.`,
                ),
              );
        xhr.onerror = () =>
          reject(
            new Error(
              "Upload failed (network / S3 CORS). The bucket must allow PUT from this site.",
            ),
          );
        xhr.send(file);
      });

      const rec = await fetch("/api/files/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          s3Key,
          name: file.name,
          size: file.size,
          mime,
        }),
      });
      if (!rec.ok)
        throw new Error("Uploaded, but couldn't save the library record.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const onDelete = async (f: LibFile) => {
    if (!confirm(`Delete "${f.name}" from the library?`)) return;
    const res = await fetch(`/api/files/library/${f.id}`, { method: "DELETE" });
    if (res.status === 409) {
      alert(
        "This file is still used by one or more guides. Remove it from those guides first.",
      );
      return;
    }
    if (res.ok) {
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(f.id);
        return next;
      });
    }
  };

  async function downloadZip(ids?: string[]) {
    setError(null);
    setZipBusy(true);
    try {
      const res = await fetch("/api/files/library/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids?.length ? { ids } : {}),
      });
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "No files to download."
            : "Could not build the ZIP.";
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `igla-library-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZIP download failed.");
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          <input type="file" hidden disabled={busy} onChange={onPick} />
          {busy ? `Uploading… ${progress}%` : "⬆ Upload file"}
        </label>
        <button
          type="button"
          disabled={zipBusy || files.length === 0}
          onClick={() => void downloadZip()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
          title="Download every library file as one ZIP"
        >
          {zipBusy ? "Building ZIP…" : "⬇ Download all as ZIP"}
        </button>
      </div>
      {busy && (
        <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full bg-zinc-900 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{selected.size} selected</span>
          <button
            type="button"
            disabled={zipBusy}
            onClick={() => void downloadZip([...selected])}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
          >
            Download selected as ZIP
          </button>
          <button
            type="button"
            onClick={() => {
              for (const id of selected) {
                window.open(`/api/files/${id}/download`, "_blank");
              }
            }}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100"
          >
            Download selected one-by-one
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-zinc-500 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {files.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400">
            No files yet. Upload one to reuse it across guides.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 text-left text-xs uppercase text-zinc-400">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={() => {
                      setSelected((prev) => {
                        if (allSelected) return new Set();
                        return new Set(files.map((f) => f.id));
                      });
                    }}
                    aria-label="Select all files"
                  />
                </th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Added</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.id)) next.delete(f.id);
                          else next.add(f.id);
                          return next;
                        });
                      }}
                      aria-label={`Select ${f.name}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <span className="mr-2">📄</span>
                    {f.name}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{fmtSize(f.size)}</td>
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(f.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <a
                      href={`/api/files/${f.id}/download`}
                      className="mr-3 text-xs text-zinc-700 hover:underline"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => void onDelete(f)}
                      className="text-xs text-zinc-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
