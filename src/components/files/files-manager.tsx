"use client";
// Files-library manager (admin). Uploads go DIRECT to S3 via a presigned PUT so
// big files (up to 100 MB) don't hit the serverless request-body limit; once the
// object is in S3 we record it as a library file. Lists + deletes existing ones.
import { useState } from "react";

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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      // 1) Presigned PUT URL.
      const pres = await fetch("/api/images/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mime, name: file.name }),
      });
      if (!pres.ok) throw new Error("Could not start the upload.");
      const { uploadUrl, s3Key } = await pres.json();

      // 2) PUT the bytes straight to S3 (XHR for a progress bar).
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", mime);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (S3 ${xhr.status}). Check S3 CORS allows PUT.`));
        xhr.onerror = () =>
          reject(new Error("Upload failed (network / S3 CORS). The bucket must allow PUT from this site."));
        xhr.send(file);
      });

      // 3) Record it as a library file.
      const rec = await fetch("/api/files/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Key, name: file.name, size: file.size, mime }),
      });
      if (!rec.ok) throw new Error("Uploaded, but couldn't save the library record.");
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
      alert("This file is still used by one or more guides. Remove it from those guides first.");
      return;
    }
    if (res.ok) setFiles((prev) => prev.filter((x) => x.id !== f.id));
  };

  return (
    <div className="mt-5">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
        <input type="file" hidden disabled={busy} onChange={onPick} />
        {busy ? `Uploading… ${progress}%` : "⬆ Upload file"}
      </label>
      {busy && (
        <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full bg-zinc-900 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {files.length === 0 ? (
          <p className="p-4 text-sm text-zinc-400">No files yet. Upload one to reuse it across guides.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 text-left text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Added</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-2">
                    <span className="mr-2">📄</span>
                    {f.name}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{fmtSize(f.size)}</td>
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(f.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
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
