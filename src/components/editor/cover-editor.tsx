"use client";
// Banner / cover photo for a guide — the big header image (e.g. the car photo)
// shown at the top of the installer view, like the reference pages.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState } from "react";
import { uploadImage } from "@/lib/client/offline";
import { useImageUrl } from "@/components/images/use-image-url";
import type { ClientDoc } from "./types";

export default function CoverEditor({
  doc,
  dispatch,
}: {
  doc: ClientDoc;
  dispatch: (ops: any[]) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = useImageUrl(doc.coverImageId);

  const pick = () => fileRef.current?.click();

  const handle = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { assetId } = await uploadImage(file, file.name);
      await dispatch([{ op: "set_cover", imageAssetId: assetId }]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mb-3">
      {/* no `capture` → mobile offers camera AND existing photos/files */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void handle(e.target.files)}
      />
      {doc.coverImageId ? (
        <div className="group relative">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="max-h-56 w-full rounded-xl object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-400">
              Loading banner…
            </div>
          )}
          <div className="absolute right-2 top-2 hidden gap-2 group-hover:flex">
            <button
              onClick={pick}
              disabled={busy}
              className="rounded-md bg-black/70 px-2 py-1 text-xs text-white hover:bg-black"
            >
              {busy ? "Uploading…" : "Replace"}
            </button>
            <button
              onClick={() => void dispatch([{ op: "set_cover", imageAssetId: null }])}
              className="rounded-md bg-black/70 px-2 py-1 text-xs text-white hover:bg-red-600"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={pick}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
        >
          🖼 {busy ? "Uploading…" : "Add banner photo (header image)"}
        </button>
      )}
    </div>
  );
}
