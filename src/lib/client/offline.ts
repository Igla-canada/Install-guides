"use client";
// Offline-tolerant dispatch for guild ops + image uploads (garage reality:
// steel-walled bays with no signal). Everything goes through here:
//  - online: straight to the API
//  - offline / failed: queued in IndexedDB, replayed in order when back online
// Pending images get a "pending:<uuid>" reference in block content; on sync the
// real ImageAsset id is substituted before the queued ops are replayed.

const DB_NAME = "igla-offline";
const DB_VERSION = 1;

type QueuedOp = {
  id?: number;
  kind: "ops" | "annotations";
  guildId?: string;
  imageRef?: string; // for annotations: assetId or pending:<uuid>
  payload: unknown;
  ts: number;
};

type QueuedUpload = {
  uuid: string;
  blob: Blob;
  mime: string;
  name: string;
  ts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("ops")) {
        db.createObjectStore("ops", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("uploads")) {
        db.createObjectStore("uploads", { keyPath: "uuid" });
      }
      if (!db.objectStoreNames.contains("idmap")) {
        db.createObjectStore("idmap"); // pending uuid -> real assetId
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// ---------------------------------------------------------------------------
// Ops dispatch
// ---------------------------------------------------------------------------

export type DispatchResult =
  | { ok: true; doc: unknown }
  | { ok: false; queued: boolean; error?: string };

export async function dispatchOps(
  guildId: string,
  ops: unknown[]
): Promise<DispatchResult> {
  try {
    const res = await fetch(`/api/guilds/${guildId}/ops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, doc: data.doc };
    }
    // Server rejected (validation/auth) — do NOT queue, surface the error.
    return { ok: false, queued: false, error: `server_${res.status}` };
  } catch {
    // Network failure — queue for replay.
    await enqueue({ kind: "ops", guildId, payload: ops, ts: Date.now() });
    return { ok: false, queued: true };
  }
}

export async function saveAnnotations(
  imageRef: string, // assetId or pending:<uuid>
  annotations: unknown[]
): Promise<{ ok: boolean; queued: boolean }> {
  if (!imageRef.startsWith("pending:")) {
    try {
      const res = await fetch(`/api/images/${imageRef}/annotations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations }),
      });
      if (res.ok) return { ok: true, queued: false };
    } catch {
      /* fall through to queue */
    }
  }
  await enqueue({
    kind: "annotations",
    imageRef,
    payload: annotations,
    ts: Date.now(),
  });
  return { ok: false, queued: true };
}

async function enqueue(item: QueuedOp) {
  const db = await openDb();
  await tx(db, "ops", "readwrite", (s) => s.add(item));
  notifyQueueChange();
}

// ---------------------------------------------------------------------------
// Image upload (online direct; offline queued blob)
// ---------------------------------------------------------------------------

export async function uploadImage(
  file: Blob,
  name: string
): Promise<{ assetId: string; pending: boolean }> {
  // Downscale photos so they upload fast and stay under the serverless body
  // limit. Non-image files (firmware .bin, settings) pass through untouched.
  const prepared = await maybeDownscale(file);
  try {
    return { assetId: await uploadNow(prepared, name), pending: false };
  } catch {
    const uuid = crypto.randomUUID();
    const db = await openDb();
    await tx(db, "uploads", "readwrite", (s) =>
      s.add({
        uuid,
        blob: prepared,
        mime: prepared.type || "application/octet-stream",
        name,
        ts: Date.now(),
      } satisfies QueuedUpload)
    );
    notifyQueueChange();
    return { assetId: `pending:${uuid}`, pending: true };
  }
}

// Upload through OUR server (same origin) — no browser→S3 CORS. The server
// puts the object in S3 and creates the ImageAsset row, returning its id.
async function uploadNow(file: Blob, name: string): Promise<string> {
  const dims = await imageDimensions(file).catch(() => null);
  const form = new FormData();
  form.append("file", file, name);
  form.append("name", name);
  if (dims) {
    form.append("width", String(dims.width));
    form.append("height", String(dims.height));
  }
  const res = await fetch("/api/images/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  const { assetId } = await res.json();
  return assetId;
}

/** Downscale an image blob to a max edge so uploads are small and quick. */
const MAX_EDGE = 1920;
async function maybeDownscale(file: Blob): Promise<Blob> {
  if (!file.type?.startsWith("image/")) return file;
  try {
    const dims = await imageDimensions(file);
    if (Math.max(dims.width, dims.height) <= MAX_EDGE && file.size < 2_500_000) {
      return file; // already small enough
    }
    const scale = MAX_EDGE / Math.max(dims.width, dims.height);
    const w = Math.round(dims.width * Math.min(1, scale));
    const h = Math.round(dims.height * Math.min(1, scale));
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    return out && out.size < file.size ? out : file;
  } catch {
    return file; // any failure → upload the original
  }
}

function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Object URL for a queued (pending) image so it can be shown/annotated offline. */
export async function pendingImageUrl(uuid: string): Promise<string | null> {
  const db = await openDb();
  const item = await tx<QueuedUpload | undefined>(db, "uploads", "readonly", (s) =>
    s.get(uuid) as IDBRequest<QueuedUpload | undefined>
  );
  return item ? URL.createObjectURL(item.blob) : null;
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

let flushing = false;

export async function flushQueue(): Promise<void> {
  if (flushing || typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  try {
    const db = await openDb();

    // 1. Uploads first — ops may reference their pending ids.
    const uploads = await tx<QueuedUpload[]>(db, "uploads", "readonly", (s) =>
      s.getAll() as IDBRequest<QueuedUpload[]>
    );
    for (const u of uploads.sort((a, b) => a.ts - b.ts)) {
      const blob = await maybeDownscale(u.blob); // shrink large queued photos
      const assetId = await uploadNow(blob, u.name); // throws on failure → abort flush
      await tx(db, "idmap", "readwrite", (s) => s.put(assetId, u.uuid));
      await tx(db, "uploads", "readwrite", (s) => s.delete(u.uuid));
    }

    // 2. Replay ops in order, substituting pending image refs.
    const items = await tx<QueuedOp[]>(db, "ops", "readonly", (s) =>
      s.getAll() as IDBRequest<QueuedOp[]>
    );
    for (const item of items.sort((a, b) => a.ts - b.ts)) {
      const payload = await substitutePendingRefs(db, item.payload);
      if (item.kind === "ops" && item.guildId) {
        const res = await fetch(`/api/guilds/${item.guildId}/ops`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: payload }),
        });
        if (!res.ok && res.status >= 500) throw new Error("replay failed");
      } else if (item.kind === "annotations" && item.imageRef) {
        const ref = (await substitutePendingRefs(db, item.imageRef)) as string;
        if (!ref.startsWith("pending:")) {
          await fetch(`/api/images/${ref}/annotations`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ annotations: payload }),
          });
        }
      }
      await tx(db, "ops", "readwrite", (s) => s.delete(item.id!));
    }
  } catch (e) {
    console.warn("offline flush incomplete, will retry", e);
  } finally {
    flushing = false;
    notifyQueueChange();
  }
}

async function substitutePendingRefs(db: IDBDatabase, value: unknown): Promise<unknown> {
  const json = JSON.stringify(value);
  if (!json.includes("pending:")) return value;
  const matches = [...json.matchAll(/pending:([a-f0-9-]+)/g)];
  let out = json;
  for (const m of matches) {
    const real = await tx<string | undefined>(db, "idmap", "readonly", (s) =>
      s.get(m[1]) as IDBRequest<string | undefined>
    );
    if (real) out = out.replaceAll(`pending:${m[1]}`, real);
  }
  return JSON.parse(out);
}

// ---------------------------------------------------------------------------
// Queue status (for the "N changes waiting to sync" badge)
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyQueueChange() {
  listeners.forEach((fn) => fn());
}

export async function queuedCount(): Promise<number> {
  const db = await openDb();
  const [ops, uploads] = await Promise.all([
    tx<number>(db, "ops", "readonly", (s) => s.count()),
    tx<number>(db, "uploads", "readonly", (s) => s.count()),
  ]);
  return ops + uploads;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushQueue());
}
