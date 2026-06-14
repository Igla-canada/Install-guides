"use client";
// Photo capture/upload + annotation entry for image, annotated_image and
// gallery blocks. A photo is ONE unit with its red heading banner (the
// connection-point label) and caption — reference-page style. Tapping the
// photo opens the annotator; saved annotations render right on the editor
// thumbnail so you see the work without opening anything. Capture works
// offline (queued in IndexedDB, see src/lib/client/offline.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { uploadImage } from "@/lib/client/offline";
import { useImageUrl } from "./use-image-url";
import Annotator, { AnnoShape, type Anno } from "./annotator";

type SingleContent = { imageAssetId?: string; heading?: string; caption?: string };
type GalleryContent = {
  gallery: true;
  items: Array<{ imageAssetId: string; caption?: string }>;
  columns?: number;
};

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

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

/** Saved annotations rendered over the editor thumbnail (reference look). */
function AnnotationOverlay({
  assetId,
  version,
}: {
  assetId: string;
  version: number;
}) {
  const [annos, setAnnos] = useState<Anno[]>([]);
  useEffect(() => {
    if (!assetId || assetId.startsWith("pending:")) return;
    let cancelled = false;
    void fetch(`/api/images/${assetId}/annotations`)
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((d) => {
        if (!cancelled) setAnnos(d.annotations ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, version]);
  if (annos.length === 0) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {annos.map((a, i) => (
        <AnnoShape key={i} anno={a} index={i} callout />
      ))}
    </svg>
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
  const [annoVersion, setAnnoVersion] = useState(0);
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
      {/* Red banner heading — the connection-point label, one unit with the photo */}
      <input
        defaultValue={content.heading ?? ""}
        placeholder="Heading — e.g. Installation Location: (1) Passenger Side Foot Well"
        onBlur={(e) => {
          if (e.target.value !== (content.heading ?? ""))
            onChange({ ...content, heading: e.target.value });
        }}
        className="mb-1 w-full rounded-md border-2 border-red-500 bg-white px-3 py-1.5 text-center text-sm font-bold text-red-600 placeholder:font-normal placeholder:text-red-300 focus:outline-none"
      />
      <div
        className="group/img relative cursor-pointer"
        onClick={() => annotatable && url && setAnnotating(true)}
        title={annotatable ? "Tap to annotate wires" : undefined}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={content.caption ?? ""} className="w-full rounded-lg" />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-400">
            Loading image…
          </div>
        )}
        {annotatable && content.imageAssetId && (
          <AnnotationOverlay assetId={content.imageAssetId} version={annoVersion} />
        )}
        {annotatable && url && (
          <span className="absolute bottom-2 right-2 hidden rounded-md bg-black/70 px-2 py-1 text-xs text-white group-hover/img:block">
            ✏ Tap to annotate
          </span>
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
          placeholder="Caption / note under the photo…"
          onBlur={(e) => {
            if (e.target.value !== (content.caption ?? ""))
              onChange({ ...content, caption: e.target.value });
          }}
          className="flex-1 border-0 bg-transparent text-xs text-zinc-500 focus:outline-none"
        />
        <button onClick={onPick} className="text-xs text-zinc-400 hover:text-zinc-600">
          Replace photo
        </button>
      </div>
      {annotating && url && content.imageAssetId && (
        <Annotator
          imageRef={content.imageAssetId}
          imageUrl={url}
          onClose={() => {
            setAnnotating(false);
            setAnnoVersion((v) => v + 1);
          }}
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
  const cols = GRID_COLS[content.columns ?? 2] ?? GRID_COLS[2];
  return (
    <div className={`grid gap-2 ${cols}`}>
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
  const [annotating, setAnnotating] = useState(false);
  const [annoVersion, setAnnoVersion] = useState(0);
  return (
    <div className="group relative">
      <input
        defaultValue={item.caption ?? ""}
        placeholder="LABEL"
        onBlur={(e) => {
          if (e.target.value !== (item.caption ?? "")) onCaption(e.target.value);
        }}
        className="mb-0.5 w-full border-0 bg-transparent text-center text-xs font-bold uppercase tracking-wide text-red-500 placeholder:font-normal placeholder:text-zinc-300 focus:outline-none"
      />
      {/* Each gallery image is independently annotatable — tap to mark wires. */}
      <div
        className="group/gi relative cursor-pointer"
        onClick={() => url && setAnnotating(true)}
        title="Tap to annotate"
      >
        {url ? (
          // natural aspect ratio so images aren't crushed into tiny squares
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.caption ?? ""} className="block w-full rounded-lg" />
        ) : (
          <div className="aspect-[4/3] w-full rounded-lg bg-zinc-100" />
        )}
        {item.imageAssetId && (
          <AnnotationOverlay assetId={item.imageAssetId} version={annoVersion} />
        )}
        {url && (
          <span className="absolute bottom-1 right-1 hidden rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white group-hover/gi:block">
            ✏ annotate
          </span>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-6 z-10 hidden rounded bg-black/60 px-1 text-xs text-white group-hover:block"
      >
        ✕
      </button>
      {annotating && url && item.imageAssetId && (
        <Annotator
          imageRef={item.imageAssetId}
          imageUrl={url}
          onClose={() => {
            setAnnotating(false);
            setAnnoVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
