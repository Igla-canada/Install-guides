"use client";
// Photo capture/upload + annotation entry for image, annotated_image and
// gallery blocks. A photo is ONE unit with its red heading banner (the
// connection-point label) and caption — reference-page style. Tapping the
// photo opens the annotator; saved annotations render right on the editor
// thumbnail so you see the work without opening anything. Capture works
// offline (queued in IndexedDB, see src/lib/client/offline.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useId, useRef, useState } from "react";
import { uploadImage } from "@/lib/client/offline";
import { useImageUrl } from "./use-image-url";
import Annotator, { AnnoOverlay, type Anno } from "./annotator";

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

// Drag an image from one holder and drop it into another (even in a different
// block). Native HTML5 DnD, one drag at a time, coordinated through this shared
// object so the two holders SWAP rather than duplicate/vanish:
//  - drop on another holder → target takes the dragged image; the source takes
//    the target's OLD image (swap), or is cleared if the target was empty (move).
//  - drop within the SAME gallery → the gallery swaps the two items in ONE
//    update (`done`), so the source's dragEnd doesn't clobber it.
//  - drop on nothing → nothing changes (the image "bounces back").
/* eslint-disable @typescript-eslint/no-explicit-any */
const IMG_DND = "application/x-igla-image";
const imgDrag: {
  id: string | null;
  setSource: ((id: string | undefined) => void) | null;
  galleryKey: string | null;
  index: number;
  landed: boolean;
  done: boolean;
  targetOldId: string | undefined;
} = {
  id: null,
  setSource: null,
  galleryKey: null,
  index: -1,
  landed: false,
  done: false,
  targetOldId: undefined,
};

function startDrag(
  e: React.DragEvent,
  assetId: string | undefined,
  setSource: (id: string | undefined) => void,
  gallery?: { key: string; index: number }
) {
  if (!assetId) return;
  imgDrag.id = assetId;
  imgDrag.setSource = setSource;
  imgDrag.galleryKey = gallery?.key ?? null;
  imgDrag.index = gallery?.index ?? -1;
  imgDrag.landed = false;
  imgDrag.done = false;
  imgDrag.targetOldId = undefined;
  e.dataTransfer.setData(IMG_DND, assetId);
  e.dataTransfer.effectAllowed = "move";
}

function endDrag() {
  if (imgDrag.landed && !imgDrag.done && imgDrag.setSource) {
    imgDrag.setSource(imgDrag.targetOldId); // swap the target's old image back (or clear)
  }
  imgDrag.id = null;
  imgDrag.setSource = null;
  imgDrag.galleryKey = null;
  imgDrag.index = -1;
  imgDrag.landed = false;
  imgDrag.done = false;
  imgDrag.targetOldId = undefined;
}

function allowDrop(e: React.DragEvent) {
  if (e.dataTransfer.types.includes(IMG_DND)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
}

function imgDragProps(
  assetId: string | undefined,
  setSource: (id: string | undefined) => void,
  gallery?: { key: string; index: number }
) {
  return {
    draggable: !!assetId && !assetId.startsWith("pending:"),
    onDragStart: (e: React.DragEvent) => startDrag(e, assetId, setSource, gallery),
    onDragEnd: endDrag,
  };
}

// Drop onto a single-image holder (currentId undefined = an empty holder).
function dropOnSingle(
  e: React.DragEvent,
  currentId: string | undefined,
  setAsset: (id: string) => void
) {
  if (!imgDrag.id || imgDrag.id === currentId) return;
  e.preventDefault();
  imgDrag.landed = true;
  imgDrag.targetOldId = currentId;
  setAsset(imgDrag.id);
}

// Drop onto a gallery item — swap within the same gallery (one update), else
// take the dragged image and hand the source the item's old image.
function dropOnGalleryItem(
  e: React.DragEvent,
  myKey: string,
  targetIndex: number,
  items: any[],
  content: any,
  onChange: (c: any) => void
) {
  if (!imgDrag.id) return;
  e.preventDefault();
  if (imgDrag.galleryKey === myKey) {
    const from = imgDrag.index;
    imgDrag.landed = true;
    imgDrag.done = true;
    if (from < 0 || from === targetIndex) return;
    const next = items.slice();
    [next[from], next[targetIndex]] = [next[targetIndex], next[from]];
    onChange({ ...content, items: next });
    return;
  }
  const oldId = items[targetIndex]?.imageAssetId as string | undefined;
  if (imgDrag.id === oldId) return;
  imgDrag.landed = true;
  imgDrag.targetOldId = oldId;
  onChange({
    ...content,
    items: items.map((x, j) => (j === targetIndex ? { ...x, imageAssetId: imgDrag.id } : x)),
  });
}

// Drop onto the gallery's "+ Add" tile — append (or move to end within-gallery).
function dropOnGalleryAdd(
  e: React.DragEvent,
  myKey: string,
  items: any[],
  content: any,
  onChange: (c: any) => void
) {
  if (!imgDrag.id) return;
  e.preventDefault();
  if (imgDrag.galleryKey === myKey) {
    const from = imgDrag.index;
    imgDrag.landed = true;
    imgDrag.done = true;
    if (from < 0) return;
    const next = items.slice();
    const [m] = next.splice(from, 1);
    next.push(m);
    onChange({ ...content, items: next });
    return;
  }
  imgDrag.landed = true;
  imgDrag.targetOldId = undefined; // append = a move; source clears
  onChange({ ...content, items: [...items, { imageAssetId: imgDrag.id }] });
}

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
      {/* No `capture` attr → on mobile the OS picker offers BOTH "Take Photo"
          and "Choose from Library/Files", not just the camera. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
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
  return <AnnoOverlay annos={annos} />;
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
        onDragOver={allowDrop}
        onDrop={(e) => dropOnSingle(e, undefined, (id) => onChange({ ...content, imageAssetId: id }))}
        className="flex w-full flex-col items-center rounded-lg border-2 border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
      >
        <span className="text-2xl">📷</span>
        {busy ? "Uploading…" : "Take photo / upload — or drag an image here"}
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
        onDragOver={allowDrop}
        onDrop={(e) => dropOnSingle(e, content.imageAssetId, (id) => onChange({ ...content, imageAssetId: id }))}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={content.caption ?? ""}
            className="w-full rounded-lg"
            {...imgDragProps(content.imageAssetId, (id) => onChange({ ...content, imageAssetId: id }))}
          />
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
          onReplaceImage={(newId) => onChange({ ...content, imageAssetId: newId })}
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
  const galleryKey = useId();
  return (
    <div className={`grid gap-2 ${cols}`}>
      {items.map((item, i) => {
        const replace = (newId: string) =>
          onChange({ ...content, items: items.map((x, j) => (j === i ? { ...x, imageAssetId: newId } : x)) });
        const remove = () => onChange({ ...content, items: items.filter((_, j) => j !== i) });
        return (
          <GalleryItem
            key={`${item.imageAssetId}-${i}`}
            item={item}
            onCaption={(caption) =>
              onChange({
                ...content,
                items: items.map((x, j) => (j === i ? { ...x, caption } : x)),
              })
            }
            onReplace={replace}
            onRemove={remove}
            dragProps={imgDragProps(
              item.imageAssetId,
              (id) => (id ? replace(id) : remove()),
              { key: galleryKey, index: i }
            )}
            onDropImg={(e) => dropOnGalleryItem(e, galleryKey, i, items, content, onChange)}
          />
        );
      })}
      <button
        onClick={onAdd}
        disabled={busy}
        onDragOver={allowDrop}
        onDrop={(e) => dropOnGalleryAdd(e, galleryKey, items, content, onChange)}
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
  onReplace,
  onRemove,
  dragProps,
  onDropImg,
}: {
  item: { imageAssetId: string; caption?: string };
  onCaption: (caption: string) => void;
  onReplace: (newAssetId: string) => void;
  onRemove: () => void;
  dragProps: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  onDropImg: (e: React.DragEvent) => void;
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
        onDragOver={allowDrop}
        onDrop={onDropImg}
      >
        {url ? (
          // natural aspect ratio so images aren't crushed into tiny squares
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={item.caption ?? ""}
            className="block w-full rounded-lg"
            {...dragProps}
          />
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
          onReplaceImage={onReplace}
          onClose={() => {
            setAnnotating(false);
            setAnnoVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
