"use client";
// Photo capture/upload + (optionally) annotation entry point for image,
// annotated_image and gallery blocks. Capture works offline: the blob is
// queued in IndexedDB and the block holds a pending:<uuid> reference until
// sync (see src/lib/client/offline.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState } from "react";
import { uploadImage } from "@/lib/client/offline";
import { useImageUrl } from "./use-image-url";
import Annotator from "./annotator";

type SingleContent = { imageAssetId?: string; caption?: string };
type GalleryContent = { gallery: true; items: Array<{ imageAssetId: string; caption?: string }> };

export default function ImageBlockEditor({
  content,
  annotatable,
  onChange,
}: {
  content: SingleContent | GalleryContent;
  annotatable: boolean;
  onChange: (content: any) => void;
}) {
  const isGallery = "gallery" in content && content.gallery;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const { assetId } = await uploadImage(file, file.name);
        uploaded.push(assetId);
      }
      if (isGallery) {
        const g = content as GalleryContent;
        onChange({
          ...g,
          items: [...(g.items ?? []), ...uploaded.map((id) => ({ imageAssetId: id }))],
        });
      } else {
        onChange({ ...(content as SingleContent), imageAssetId: uploaded[0] });
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={isGallery}
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
      {isGallery ? (
        <GalleryEditor
          content={content as GalleryContent}
          onChange={onChange}
          onAdd={() => fileRef.current?.click()}
          busy={busy}
        />
      ) : (
        <SingleEditor
          content={content as SingleContent}
          annotatable={annotatable}
          onChange={onChange}
          onPick={() => fileRef.current?.click()}
          busy={busy}
        />
      )}
    </div>
  );
}

function SingleEditor({
  content,
  annotatable,
  onChange,
  onPick,
  busy,
}: {
  content: SingleContent;
  annotatable: boolean;
  onChange: (c: any) => void;
  onPick: () => void;
  busy: boolean;
}) {
  const url = useImageUrl(content.imageAssetId);
  const [annotating, setAnnotating] = useState(false);
  const pending = content.imageAssetId?.startsWith("pending:");

  if (!content.imageAssetId) {
    return (
      <button
        onClick={onPick}
        disabled={busy}
        className="flex w-full flex-col items-center rounded-lg border-2 border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
      >
        <span className="text-2xl">📷</span>
        {busy ? "Uploading…" : "Take photo / upload"}
      </button>
    );
  }

  return (
    <div>
      <div className="relative">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={content.caption ?? ""} className="max-h-96 rounded-lg" />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-400">
            Loading image…
          </div>
        )}
        {pending && (
          <span className="absolute left-2 top-2 rounded bg-orange-500/90 px-2 py-0.5 text-xs text-white">
            saved on device — will upload when online
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          defaultValue={content.caption ?? ""}
          placeholder="Caption…"
          onBlur={(e) => {
            if (e.target.value !== content.caption)
              onChange({ ...content, caption: e.target.value });
          }}
          className="flex-1 border-0 bg-transparent text-xs text-zinc-500 focus:outline-none"
        />
        {annotatable && url && (
          <button
            onClick={() => setAnnotating(true)}
            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            ✏ Annotate wires
          </button>
        )}
        <button onClick={onPick} className="text-xs text-zinc-400 hover:text-zinc-600">
          Replace
        </button>
      </div>
      {annotating && url && content.imageAssetId && (
        <Annotator
          imageRef={content.imageAssetId}
          imageUrl={url}
          onClose={() => setAnnotating(false)}
        />
      )}
    </div>
  );
}

function GalleryEditor({
  content,
  onChange,
  onAdd,
  busy,
}: {
  content: GalleryContent;
  onChange: (c: any) => void;
  onAdd: () => void;
  busy: boolean;
}) {
  const items = content.items ?? [];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item, i) => (
        <GalleryItem
          key={`${item.imageAssetId}-${i}`}
          item={item}
          onCaption={(caption) =>
            onChange({
              ...content,
              items: items.map((x, j) => (j === i ? { ...x, caption } : x)),
            })
          }
          onRemove={() =>
            onChange({ ...content, items: items.filter((_, j) => j !== i) })
          }
        />
      ))}
      <button
        onClick={onAdd}
        disabled={busy}
        className="flex min-h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 text-sm text-zinc-400 hover:border-zinc-400"
      >
        <span className="text-xl">📷</span>
        {busy ? "Uploading…" : "Add"}
      </button>
    </div>
  );
}

function GalleryItem({
  item,
  onCaption,
  onRemove,
}: {
  item: { imageAssetId: string; caption?: string };
  onCaption: (caption: string) => void;
  onRemove: () => void;
}) {
  const url = useImageUrl(item.imageAssetId);
  return (
    <div className="group relative">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={item.caption ?? ""} className="h-24 w-full rounded-lg object-cover" />
      ) : (
        <div className="h-24 w-full rounded-lg bg-zinc-100" />
      )}
      <button
        onClick={onRemove}
        className="absolute right-1 top-1 hidden rounded bg-black/60 px-1 text-xs text-white group-hover:block"
      >
        ✕
      </button>
      <input
        defaultValue={item.caption ?? ""}
        placeholder="Caption…"
        onBlur={(e) => {
          if (e.target.value !== item.caption) onCaption(e.target.value);
        }}
        className="mt-0.5 w-full border-0 bg-transparent text-xs text-zinc-500 focus:outline-none"
      />
    </div>
  );
}
