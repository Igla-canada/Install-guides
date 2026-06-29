"use client";
// Annotation canvas. The primary tool is a LEADER-LINE CALLOUT (data shape
// "arrow"): you drag from where you want the label box to where the wire is —
// a white, slightly-transparent label box sits at the start end with the text
// inside it, and an arrow points to the wire at the other end. This mirrors
// the original Notion install pages.
//
// Everything is editable after the fact: tap a marker to select it, then drag
// the whole thing (grab the line) or any handle (the label box, the arrow tip,
// a point, or a box-rect corner). Coordinates are normalized 0–1 so they
// survive any resize. Annotations are DATA over the image, never burned in.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useId, useRef, useState } from "react";
import { saveAnnotations, uploadImage } from "@/lib/client/offline";

type Shape = "point" | "arrow" | "box" | "circle";

// Discrete zoom stops (the −/+ buttons walk these): 25%…200% in 25% steps.
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const MIN_Z = ZOOM_STEPS[0];
const MAX_Z = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export type Anno = {
  shape: Shape;
  // point:{x,y}; arrow:{x1,y1,x2,y2} (1=box, 2=wire);
  // box/circle:{x,y,w,h, rot?} (rot = degrees, box only)
  coords: any;
  label: string;
  description?: string;
  color: string;
  order: number;
};

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];

const pct = (v: number) => `${v * 100}%`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Rotate point (px,py) around center (cx,cy) by `deg` degrees, in PIXEL space
// (clockwise, matching CSS rotate() in a y-down coordinate system).
function rotPx(px: number, py: number, cx: number, cy: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

// Rotate a shape about its OWN center. Uses fill-box + the `center` keyword,
// which is broadly supported (incl. mobile Safari) — this is the path that
// renders on installer-facing views, so robustness matters most here.
function rotSelf(rot?: number): React.CSSProperties | undefined {
  if (!rot) return undefined;
  return { transformBox: "fill-box", transformOrigin: "center", transform: `rotate(${rot}deg)` };
}

// Rotate an element about ANOTHER point (the box center) — used only for the
// editor's drag handles so they track a rotated box. Pivot is expressed in
// viewport percentages, matching the box center's normalized coords.
function rotAbout(cx: number, cy: number, rot?: number): React.CSSProperties | undefined {
  if (!rot) return undefined;
  return {
    transformBox: "view-box",
    transformOrigin: `${pct(cx)} ${pct(cy)}`,
    transform: `rotate(${rot}deg)`,
  };
}

/** Size of the label box (in px) for a given label, sized to its longest line. */
function boxGeom(label: string | undefined, fallback: string) {
  const text = label && label.trim() ? label.trim() : fallback;
  const lines = text.split("\n");
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const boxW = Math.max(34, Math.round(maxLen * 7.4 + 16));
  const boxH = lines.length * 16 + 10;
  return { lines, boxW, boxH };
}

/** The white, slightly-transparent label box with colored border + text. */
function LabelBox({
  cx,
  cy,
  label,
  fallback,
  color,
}: {
  cx: number;
  cy: number;
  label: string | undefined;
  fallback: string;
  color: string;
}) {
  const { lines, boxW, boxH } = boxGeom(label, fallback);
  return (
    <svg x={pct(cx)} y={pct(cy)} overflow="visible" style={{ pointerEvents: "none" }}>
      <g transform={`translate(${-boxW / 2}, ${-boxH / 2})`}>
        <rect
          width={boxW}
          height={boxH}
          rx={5}
          fill="rgba(255,255,255,0.85)"
          stroke={color}
          strokeWidth={2}
        />
        {lines.map((ln, i) => (
          <text
            key={i}
            x={boxW / 2}
            y={15 + i * 16}
            textAnchor="middle"
            fontSize={12.5}
            fontWeight={700}
            fill={color}
          >
            {ln}
          </text>
        ))}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

type Mode = "box" | "tip" | "point" | "move" | "resize" | "body" | "rotate";

// How far above the box's top-center the rotation grip sits (normalized y).
const ROT_HANDLE_OFFSET = 0.05;
type Drag =
  | { kind: "create"; startX: number; startY: number }
  | { kind: "handle"; index: number; mode: Mode }
  | { kind: "translate"; index: number; lastX: number; lastY: number }
  | null;

export default function Annotator({
  imageRef,
  imageUrl,
  onClose,
  onReplaceImage,
}: {
  imageRef: string; // assetId or pending:<uuid>
  imageUrl: string;
  onClose: () => void;
  // Swap the block's image to a new asset (used by "Set as view", which bakes a
  // cropped image and points the block at it).
  onReplaceImage?: (newAssetId: string) => void;
}) {
  const [annos, setAnnos] = useState<Anno[]>([]);
  const [tool, setTool] = useState<Shape>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Anno | null>(null);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag>(null);
  const lastPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // --- Pinch-to-zoom / pan (mobile) -----------------------------------------
  // Two fingers zoom + pan the image so wires can be marked precisely; one
  // finger still annotates. The transform is applied to BOTH the image and the
  // SVG overlay, so normalized coords stay correct at any zoom.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<
    | null
    | { startDist: number; startZoom: number; panX: number; panY: number; midX: number; midY: number }
  >(null);
  const gesturePinched = useRef(false);
  const addedPoint = useRef<number | null>(null);
  // Pan tool (desktop): drag the zoomed image around instead of annotating, so
  // you're not stuck looking at the centre when zoomed in.
  const [panTool, setPanTool] = useState(false);
  const panDrag = useRef<null | { x: number; y: number; panX: number; panY: number }>(null);

  const clampPan = (z: number, px: number, py: number) => {
    const outer = outerRef.current;
    const wrap = wrapRef.current;
    if (!outer || !wrap) return { x: px, y: py };
    const ow = outer.clientWidth;
    const oh = outer.clientHeight;
    const sw = wrap.offsetWidth * z;
    const sh = wrap.offsetHeight * z;
    // Smaller than the viewport on an axis → center on it; otherwise clamp so
    // you can't pan past an edge.
    const axis = (o: number, s: number, p: number) =>
      s <= o ? (o - s) / 2 : Math.min(0, Math.max(o - s, p));
    return { x: axis(ow, sw, px), y: axis(oh, sh, py) };
  };

  // Zoom keeping the viewport center fixed (used by the −/+ buttons).
  const zoomTo = (z: number) => {
    const nz = Math.min(MAX_Z, Math.max(MIN_Z, z));
    const outer = outerRef.current;
    if (!outer) {
      setZoom(nz);
      return;
    }
    const cx = outer.clientWidth / 2;
    const cy = outer.clientHeight / 2;
    const ux = (cx - pan.x) / zoom;
    const uy = (cy - pan.y) / zoom;
    setZoom(nz);
    setPan(clampPan(nz, cx - nz * ux, cy - nz * uy));
  };

  // Walk to the next/previous discrete zoom stop.
  const stepZoom = (dir: 1 | -1) => {
    let idx = 0;
    let best = Infinity;
    ZOOM_STEPS.forEach((s, i) => {
      const d = Math.abs(s - zoom);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    zoomTo(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + dir))]);
  };

  useEffect(() => {
    if (imageRef.startsWith("pending:")) return; // nothing server-side yet
    void fetch(`/api/images/${imageRef}/annotations`)
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((d) => {
        setAnnos(
          (d.annotations ?? []).map((a: any) => ({
            shape: a.shape,
            coords: a.coords,
            label: a.label,
            description: a.description ?? "",
            color: a.color,
            order: a.order,
          }))
        );
      });
  }, [imageRef]);

  const [baking, setBaking] = useState(false);

  // "Set as view": bake the currently-visible (zoomed/panned) region into a NEW
  // image, re-map the annotations onto that crop, upload it, and point the block
  // at it. The result is a plain 100% image showing exactly the marked region —
  // no runtime transform to drift, and annotations stay editable as overlay data.
  const bakeView = async () => {
    const outer = outerRef.current;
    const wrap = wrapRef.current;
    if (!outer || !wrap || zoom <= 1) return;
    const ow = outer.clientWidth;
    const oh = outer.clientHeight;
    const iw = wrap.offsetWidth; // image width at scale 1 (fills the canvas)
    const ih = wrap.offsetHeight;
    // The visible viewport mapped back into the image's normalized 0–1 space.
    const left = clamp01((0 - pan.x) / (iw * zoom));
    const right = clamp01((ow - pan.x) / (iw * zoom));
    const top = clamp01((0 - pan.y) / (ih * zoom));
    const bottom = clamp01((oh - pan.y) / (ih * zoom));
    const cw = right - left;
    const ch = bottom - top;
    if (cw <= 0.001 || ch <= 0.001) return;

    setBaking(true);
    try {
      // Same-origin bytes so the canvas isn't cross-origin tainted (pending
      // images are already a local object URL).
      const srcUrl = imageRef.startsWith("pending:")
        ? imageUrl
        : `/api/images/${imageRef}/raw`;
      const resp = await fetch(srcUrl);
      if (!resp.ok) throw new Error(`source ${resp.status}`);
      const bitmap = await createImageBitmap(await resp.blob());
      const NW = bitmap.width;
      const NH = bitmap.height;
      const sx = Math.round(left * NW);
      const sy = Math.round(top * NH);
      const sw = Math.max(1, Math.round(cw * NW));
      const sh = Math.max(1, Math.round(ch * NH));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      bitmap.close?.();
      const outBlob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.9)
      );
      if (!outBlob) throw new Error("toBlob failed");

      // Re-map every annotation coordinate into the cropped image's space.
      const mapX = (nx: number) => (nx - left) / cw;
      const mapY = (ny: number) => (ny - top) / ch;
      const remapped = annos.map((a, i) => {
        if (a.shape === "point")
          return { ...a, order: i, coords: { x: mapX(a.coords.x), y: mapY(a.coords.y) } };
        if (a.shape === "arrow")
          return {
            ...a,
            order: i,
            coords: {
              x1: mapX(a.coords.x1),
              y1: mapY(a.coords.y1),
              x2: mapX(a.coords.x2),
              y2: mapY(a.coords.y2),
            },
          };
        return {
          ...a,
          order: i,
          coords: {
            ...a.coords,
            x: mapX(a.coords.x),
            y: mapY(a.coords.y),
            w: a.coords.w / cw,
            h: a.coords.h / ch,
          },
        };
      });

      const { assetId: newId } = await uploadImage(outBlob, "cropped.jpg");
      await saveAnnotations(newId, remapped);
      onReplaceImage?.(newId);
      onClose();
    } catch (e) {
      console.error("bakeView failed", e);
      alert("Couldn't create the cropped image. Check your connection and try again.");
    } finally {
      setBaking(false);
    }
  };

  const norm = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  };
  const rectWH = () => {
    const r = svgRef.current!.getBoundingClientRect();
    return { RW: r.width, RH: r.height };
  };

  function hitTest(p: { x: number; y: number }): { index: number; mode: Mode } | null {
    const { RW, RH } = rectWH();
    const PX = p.x * RW;
    const PY = p.y * RH;
    const near = (ax: number, ay: number, r = 16) =>
      Math.hypot(ax * RW - PX, ay * RH - PY) < r;

    // Topmost first; the selected one wins ties so its handles are reachable.
    const ordered = annos.map((_, i) => i).reverse();
    if (selected != null)
      ordered.sort((a, b) => (a === selected ? -1 : b === selected ? 1 : 0));

    for (const i of ordered) {
      const a = annos[i];
      if (a.shape === "point") {
        if (near(a.coords.x, a.coords.y, 18)) return { index: i, mode: "point" };
      } else if (a.shape === "arrow") {
        if (near(a.coords.x2, a.coords.y2, 16)) return { index: i, mode: "tip" };
        const { boxW, boxH } = boxGeom(a.label, `${i + 1}`);
        const cx = a.coords.x1 * RW;
        const cy = a.coords.y1 * RH;
        if (Math.abs(PX - cx) <= boxW / 2 + 4 && Math.abs(PY - cy) <= boxH / 2 + 4)
          return { index: i, mode: "box" };
        if (segDistPx(p, a.coords, RW, RH) < 12) return { index: i, mode: "body" };
      } else {
        // box or circle (both use {x,y,w,h}; box may have rot)
        const { x, y, w, h } = a.coords;
        const rot = a.coords.rot ?? 0;
        const cxpx = (x + w / 2) * RW;
        const cypx = (y + h / 2) * RH;
        // Rotation grip (box only) lives above the rotated top-center.
        if (a.shape === "box") {
          const [hxp, hyp] = rotPx((x + w / 2) * RW, (y - ROT_HANDLE_OFFSET) * RH, cxpx, cypx, rot);
          if (Math.hypot(hxp - PX, hyp - PY) < 16) return { index: i, mode: "rotate" };
        }
        // Compare against the un-rotated box by rotating the pointer back.
        const [lpx, lpy] = rotPx(PX, PY, cxpx, cypx, -rot);
        if (Math.hypot((x + w) * RW - lpx, (y + h) * RH - lpy) < 16)
          return { index: i, mode: "resize" };
        if (lpx >= x * RW && lpx <= (x + w) * RW && lpy >= y * RH && lpy <= (y + h) * RH)
          return { index: i, mode: "move" };
      }
    }
    return null;
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Second finger down → start a pinch; undo any annotation the first finger
    // began (a just-placed point, or an in-progress create drag).
    if (pointers.current.size >= 2) {
      gesturePinched.current = true;
      dragRef.current = null;
      setDraft(null);
      if (addedPoint.current != null) {
        const idx = addedPoint.current;
        setAnnos((prev) => prev.filter((_, j) => j !== idx));
        setSelected(null);
        addedPoint.current = null;
      }
      const pts = [...pointers.current.values()];
      pinch.current = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        startZoom: zoom,
        panX: pan.x,
        panY: pan.y,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
      };
      return;
    }

    // Pan tool: a single-finger / mouse drag moves the zoomed image.
    if (panTool) {
      e.currentTarget.setPointerCapture(e.pointerId);
      panDrag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }

    const p = norm(e);
    lastPt.current = p;
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = hitTest(p);
    if (hit) {
      setSelected(hit.index);
      if (hit.mode === "move" || hit.mode === "body") {
        dragRef.current = { kind: "translate", index: hit.index, lastX: p.x, lastY: p.y };
      } else {
        dragRef.current = { kind: "handle", index: hit.index, mode: hit.mode };
      }
      return;
    }
    // Empty space → create with the current tool.
    setSelected(null);
    if (tool === "point") {
      setAnnos((prev) => [
        ...prev,
        { shape: "point", coords: p, label: "", description: "", color, order: prev.length },
      ]);
      setSelected(annos.length);
      addedPoint.current = annos.length; // so a 2-finger pinch can undo it
      dragRef.current = null;
    } else {
      dragRef.current = { kind: "create", startX: p.x, startY: p.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // Pinch: recompute zoom from finger distance, pan to keep the start
    // midpoint anchored under the fingers.
    if (pinch.current && pointers.current.size >= 2) {
      const outer = outerRef.current;
      if (!outer) return;
      const o = outer.getBoundingClientRect();
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const nz = Math.min(MAX_Z, Math.max(MIN_Z, (pinch.current.startZoom * dist) / pinch.current.startDist));
      const midX = (pts[0].x + pts[1].x) / 2 - o.left;
      const midY = (pts[0].y + pts[1].y) / 2 - o.top;
      const ux = (pinch.current.midX - o.left - pinch.current.panX) / pinch.current.startZoom;
      const uy = (pinch.current.midY - o.top - pinch.current.panY) / pinch.current.startZoom;
      setZoom(nz);
      setPan(clampPan(nz, midX - nz * ux, midY - nz * uy));
      return;
    }
    if (gesturePinched.current) return; // a finger left over after a pinch — don't draw

    // Pan tool drag.
    if (panDrag.current) {
      setPan(
        clampPan(
          zoom,
          panDrag.current.panX + (e.clientX - panDrag.current.x),
          panDrag.current.panY + (e.clientY - panDrag.current.y)
        )
      );
      return;
    }

    const d = dragRef.current;
    if (!d) return;
    const p = norm(e);
    lastPt.current = p;
    if (d.kind === "create") {
      setDraft(
        tool === "arrow"
          ? {
              shape: "arrow",
              coords: { x1: d.startX, y1: d.startY, x2: p.x, y2: p.y },
              label: "",
              description: "",
              color,
              order: annos.length,
            }
          : {
              shape: tool, // "box" or "circle"
              coords: {
                x: Math.min(d.startX, p.x),
                y: Math.min(d.startY, p.y),
                w: Math.abs(p.x - d.startX),
                h: Math.abs(p.y - d.startY),
              },
              label: "",
              description: "",
              color,
              order: annos.length,
            }
      );
    } else if (d.kind === "handle") {
      setAnnos((prev) => prev.map((a, i) => (i === d.index ? applyHandle(a, d.mode, p, rectWH()) : a)));
    } else if (d.kind === "translate") {
      const dx = p.x - d.lastX;
      const dy = p.y - d.lastY;
      d.lastX = p.x;
      d.lastY = p.y;
      setAnnos((prev) => prev.map((a, i) => (i === d.index ? translate(a, dx, dy) : a)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (panDrag.current) {
      panDrag.current = null;
      if (pointers.current.size === 0) return;
    }
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0 && gesturePinched.current) {
      // The whole gesture was a pinch — don't commit any annotation from it.
      gesturePinched.current = false;
      addedPoint.current = null;
      dragRef.current = null;
      setDraft(null);
      return;
    }
    if (pointers.current.size >= 1) return; // still mid-gesture (fingers down)
    addedPoint.current = null;

    const d = dragRef.current;
    if (d?.kind === "create") {
      // Build from refs, not from `draft` state — robust even if React hasn't
      // flushed the in-drag preview render yet.
      const end = lastPt.current;
      const dist = Math.hypot(end.x - d.startX, end.y - d.startY);
      if (dist > 0.01) {
        const made: Anno =
          tool === "arrow"
            ? {
                shape: "arrow",
                coords: { x1: d.startX, y1: d.startY, x2: end.x, y2: end.y },
                label: "",
                description: "",
                color,
                order: annos.length,
              }
            : {
                shape: tool, // "box" or "circle"
                coords: {
                  x: Math.min(d.startX, end.x),
                  y: Math.min(d.startY, end.y),
                  w: Math.abs(end.x - d.startX),
                  h: Math.abs(end.y - d.startY),
                },
                label: "",
                description: "",
                color,
                order: annos.length,
              };
        setAnnos((prev) => [...prev, made]);
        setSelected(annos.length);
      }
    }
    setDraft(null);
    dragRef.current = null;
  };

  const update = (i: number, patch: Partial<Anno>) =>
    setAnnos((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const save = async () => {
    setSaving(true);
    const result = await saveAnnotations(
      imageRef,
      annos.map((a, i) => ({ ...a, order: i }))
    );
    setSaving(false);
    if (result.queued) {
      alert("No connection — annotations saved on this device and will sync when online.");
    }
    onClose();
  };

  const toolLabel: Record<Shape, string> = {
    arrow: "↘ Label",
    point: "• Point",
    box: "▭ Box",
    circle: "◯ Circle",
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-2 sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-xl bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2">
          <span className="text-sm font-medium">Annotate</span>
          {(["arrow", "point", "box", "circle"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTool(t);
                setPanTool(false);
              }}
              className={`rounded-md px-2 py-1 text-sm ${
                tool === t && !panTool ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"
              }`}
            >
              {toolLabel[t]}
            </button>
          ))}
          <button
            onClick={() => setPanTool((v) => !v)}
            title="Pan — drag the zoomed image to move around"
            className={`rounded-md px-2 py-1 text-sm ${
              panTool ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"
            }`}
          >
            ✋ Pan
          </button>
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  if (selected != null) update(selected, { color: c });
                }}
                className={`h-5 w-5 rounded-full border-2 ${
                  color === c ? "border-zinc-900" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => stepZoom(-1)}
              disabled={zoom <= MIN_Z}
              title="Zoom out"
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm leading-none disabled:opacity-40"
            >
              −
            </button>
            <span className="w-10 text-center text-xs text-zinc-500">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => stepZoom(1)}
              disabled={zoom >= MAX_Z}
              title="Zoom in"
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm leading-none disabled:opacity-40"
            >
              +
            </button>
            {zoom !== 1 && (
              <button
                onClick={() => zoomTo(1)}
                className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
              >
                reset
              </button>
            )}
          </div>

          {/* Set as view: crop the image to the current zoom/position into a NEW
              image and swap it in — a flat 100% image of exactly this region. */}
          <button
            onClick={() => void bakeView()}
            disabled={zoom <= 1 || baking}
            title="Crop the image to what you see now and replace it with that"
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40"
          >
            {baking ? "Cropping…" : "⛶ Set as view (crop)"}
          </button>

          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1 text-sm hover:bg-zinc-100">
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-md bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700"
            >
              {saving ? "Saving…" : "Save annotations"}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Canvas */}
          <div ref={outerRef} className="relative min-h-0 flex-1 overflow-hidden bg-zinc-900">
            <div
              ref={wrapRef}
              className="relative inline-block w-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="w-full select-none" draggable={false} />
              <svg
                ref={svgRef}
                className="absolute inset-0 h-full w-full touch-none"
                style={{ cursor: panTool ? "grab" : undefined }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {annos.map((a, i) => (
                  <EditorAnno key={i} anno={a} index={i} selected={selected === i} />
                ))}
                {draft && <EditorAnno anno={draft} index={annos.length} selected={false} />}
              </svg>
            </div>
          </div>

          {/* Label list */}
          <div className="max-h-56 w-full overflow-y-auto border-t border-zinc-200 sm:max-h-none sm:w-72 sm:border-l sm:border-t-0">
            <p className="border-b border-zinc-100 p-3 text-xs text-zinc-400">
              Pick a color, then drag from where you want the label to the wire it
              points at. Tap any marker to select it, then drag the line to move
              it, or its box / arrow-tip handle to fine-tune. A selected box also
              has a grip above it — drag that to rotate it to any angle. Use the
              ◯ Circle tool to ring something without any text. Pinch with two
              fingers (or use −/+) to zoom in for precise marking; one finger marks.
            </p>
            {annos.map((a, i) => (
              <div
                key={i}
                className={`border-b border-zinc-100 p-3 ${selected === i ? "bg-amber-50" : ""}`}
                onClick={() => setSelected(i)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {i + 1}
                  </span>
                  {a.shape === "circle" ? (
                    <span className="min-w-0 flex-1 text-sm italic text-zinc-400">
                      Circle marker (no label)
                    </span>
                  ) : (
                    <input
                      value={a.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      placeholder={
                        a.shape === "point"
                          ? "Label (shown in the list below the photo)"
                          : "Label (shown in the box, e.g. CAN-H)"
                      }
                      className="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1 text-sm font-medium"
                    />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAnnos(annos.filter((_, j) => j !== i));
                      setSelected(null);
                    }}
                    className="text-zinc-300 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  value={a.description ?? ""}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder="Note shown under the photo (e.g. splice to pin 6)"
                  rows={2}
                  className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function applyHandle(
  a: Anno,
  mode: Mode,
  p: { x: number; y: number },
  dims: { RW: number; RH: number }
): Anno {
  const { RW, RH } = dims;
  if (mode === "point") return { ...a, coords: { x: p.x, y: p.y } };
  if (mode === "box") return { ...a, coords: { ...a.coords, x1: p.x, y1: p.y } };
  if (mode === "tip") return { ...a, coords: { ...a.coords, x2: p.x, y2: p.y } };
  if (mode === "rotate") {
    const cx = a.coords.x + a.coords.w / 2;
    const cy = a.coords.y + a.coords.h / 2;
    // Angle from center to pointer (px space); grip baseline points up = rot 0.
    const ang = (Math.atan2(p.y * RH - cy * RH, p.x * RW - cx * RW) * 180) / Math.PI;
    return { ...a, coords: { ...a.coords, rot: Math.round(ang + 90) } };
  }
  if (mode === "resize") {
    const rot = a.coords.rot ?? 0;
    let lp = p;
    if (rot) {
      // Rotate the pointer back into the box's un-rotated frame before sizing.
      const cx = a.coords.x + a.coords.w / 2;
      const cy = a.coords.y + a.coords.h / 2;
      const [lx, ly] = rotPx(p.x * RW, p.y * RH, cx * RW, cy * RH, -rot);
      lp = { x: lx / RW, y: ly / RH };
    }
    return {
      ...a,
      coords: {
        ...a.coords,
        w: Math.max(0.02, lp.x - a.coords.x),
        h: Math.max(0.02, lp.y - a.coords.y),
      },
    };
  }
  return a;
}

function translate(a: Anno, dx: number, dy: number): Anno {
  if (a.shape === "point")
    return { ...a, coords: { x: clamp01(a.coords.x + dx), y: clamp01(a.coords.y + dy) } };
  if (a.shape === "arrow")
    return {
      ...a,
      coords: {
        x1: clamp01(a.coords.x1 + dx),
        y1: clamp01(a.coords.y1 + dy),
        x2: clamp01(a.coords.x2 + dx),
        y2: clamp01(a.coords.y2 + dy),
      },
    };
  return { ...a, coords: { ...a.coords, x: clamp01(a.coords.x + dx), y: clamp01(a.coords.y + dy) } };
}

function segDistPx(
  p: { x: number; y: number },
  c: any,
  RW: number,
  RH: number
): number {
  const ax = c.x1 * RW,
    ay = c.y1 * RH,
    bx = c.x2 * RW,
    by = c.y2 * RH,
    px = p.x * RW,
    py = p.y * RH;
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Editor-side rendering of one annotation, with drag handles when selected. */
function EditorAnno({
  anno,
  index,
  selected,
}: {
  anno: Anno;
  index: number;
  selected: boolean;
}) {
  const color = anno.color || "#ef4444";
  const mid = `eah-${index}`;

  if (anno.shape === "point") {
    return (
      <g>
        {selected && (
          <circle cx={pct(anno.coords.x)} cy={pct(anno.coords.y)} r={16} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 3" />
        )}
        <circle cx={pct(anno.coords.x)} cy={pct(anno.coords.y)} r={11} fill={color} fillOpacity={0.9} stroke="#fff" strokeWidth={2} />
        <text x={pct(anno.coords.x)} y={pct(anno.coords.y)} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700}>
          {index + 1}
        </text>
      </g>
    );
  }

  if (anno.shape === "arrow") {
    const { x1, y1, x2, y2 } = anno.coords;
    return (
      <g>
        <defs>
          <marker id={mid} markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill={color} />
          </marker>
        </defs>
        <line x1={pct(x1)} y1={pct(y1)} x2={pct(x2)} y2={pct(y2)} stroke={color} strokeWidth={2.5} markerEnd={`url(#${mid})`} />
        <circle cx={pct(x2)} cy={pct(y2)} r={3.5} fill={color} />
        <LabelBox cx={x1} cy={y1} label={anno.label} fallback={`${index + 1}`} color={color} />
        {selected && (
          <>
            {/* arrow-tip handle */}
            <circle cx={pct(x2)} cy={pct(y2)} r={8} fill="#fff" stroke={color} strokeWidth={2} />
            {/* box-end handle */}
            <circle cx={pct(x1)} cy={pct(y1)} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
          </>
        )}
      </g>
    );
  }

  // box or circle (both bounded by {x,y,w,h}; box may carry a rotation)
  const { x, y, w, h } = anno.coords;
  const rot = anno.coords.rot ?? 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const isCircle = anno.shape === "circle";
  const self = rotSelf(rot); // rotate the shape about its own center
  const about = rotAbout(cx, cy, rot); // rotate handles about the box center
  return (
    <g>
      {isCircle ? (
        <ellipse cx={pct(cx)} cy={pct(cy)} rx={pct(w / 2)} ry={pct(h / 2)} fill="none" stroke={color} strokeWidth={2.5} style={self} />
      ) : (
        <rect x={pct(x)} y={pct(y)} width={pct(w)} height={pct(h)} fill="none" stroke={color} strokeWidth={2.5} rx={4} style={self} />
      )}
      {!isCircle && (
        <LabelBox cx={cx} cy={y} label={anno.label} fallback={`${index + 1}`} color={color} />
      )}
      {selected && (
        <>
          {/* resize grip (bottom-right corner, tracks rotation) */}
          <circle cx={pct(x + w)} cy={pct(y + h)} r={7} fill="#fff" stroke={color} strokeWidth={2} style={about} />
          {/* rotation grip above top-center (box only) */}
          {!isCircle && (
            <>
              <line x1={pct(cx)} y1={pct(y)} x2={pct(cx)} y2={pct(y - ROT_HANDLE_OFFSET)} stroke={color} strokeWidth={1.5} style={about} />
              <circle cx={pct(cx)} cy={pct(y - ROT_HANDLE_OFFSET)} r={7} fill={color} stroke="#fff" strokeWidth={2} style={about} />
            </>
          )}
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Read-only rendering (viewer + editor thumbnails) — must match EditorAnno.
// ---------------------------------------------------------------------------

export function AnnoShape({
  anno,
  index,
  selected,
  onSelect,
  callout = false,
}: {
  anno: Anno;
  index: number;
  selected?: boolean;
  onSelect?: () => void;
  /** Reference-page look: white label box + leader line. */
  callout?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  if (callout) return <CalloutShape anno={anno} index={index} uid={uid} />;

  // Plain fallback (unused by current callers, kept for safety).
  const color = anno.color || "#ef4444";
  const common = {
    onPointerDown: (e: React.PointerEvent) => {
      if (onSelect) {
        e.stopPropagation();
        onSelect();
      }
    },
    style: { cursor: onSelect ? "pointer" : undefined },
  };
  if (anno.shape === "point") {
    return (
      <g {...common}>
        <circle cx={pct(anno.coords.x)} cy={pct(anno.coords.y)} r={12} fill={color} fillOpacity={0.9} stroke="#fff" strokeWidth={2} />
        <text x={pct(anno.coords.x)} y={pct(anno.coords.y)} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700}>
          {index + 1}
        </text>
      </g>
    );
  }
  return <CalloutShape anno={anno} index={index} uid={uid} />;
}

function CalloutShape({ anno, index, uid }: { anno: Anno; index: number; uid: string }) {
  const color = anno.color || "#ef4444";
  const mid = `vah-${uid}-${index}`;

  // A point is just its numbered marker — its text lives in the list below the
  // photo, so the number stays readable on the image (no overlapping label box).
  if (anno.shape === "point") {
    return (
      <g>
        <circle cx={pct(anno.coords.x)} cy={pct(anno.coords.y)} r={12} fill={color} fillOpacity={0.9} stroke="#fff" strokeWidth={2} />
        <text x={pct(anno.coords.x)} y={pct(anno.coords.y)} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700}>
          {index + 1}
        </text>
      </g>
    );
  }

  // A circle is an empty outline used to ring something — no text at all.
  if (anno.shape === "circle") {
    const { x, y, w, h } = anno.coords;
    return (
      <ellipse cx={pct(x + w / 2)} cy={pct(y + h / 2)} rx={pct(w / 2)} ry={pct(h / 2)} fill="none" stroke={color} strokeWidth={2.5} />
    );
  }

  if (anno.shape === "box") {
    const { x, y, w, h } = anno.coords;
    const rot = anno.coords.rot ?? 0;
    return (
      <g>
        <rect
          x={pct(x)}
          y={pct(y)}
          width={pct(w)}
          height={pct(h)}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          rx={4}
          style={rotSelf(rot)}
        />
        <LabelBox cx={x + w / 2} cy={y} label={anno.label} fallback={`${index + 1}`} color={color} />
      </g>
    );
  }

  // arrow (leader-line callout)
  const origin = { x: anno.coords.x1, y: anno.coords.y1 };
  const target = { x: anno.coords.x2, y: anno.coords.y2 };
  return (
    <g>
      <defs>
        <marker id={mid} markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={pct(origin.x)}
        y1={pct(origin.y)}
        x2={pct(target.x)}
        y2={pct(target.y)}
        stroke={color}
        strokeWidth={2.5}
        markerEnd={`url(#${mid})`}
      />
      <circle cx={pct(target.x)} cy={pct(target.y)} r={3.5} fill={color} />
      <LabelBox cx={origin.x} cy={origin.y} label={anno.label} fallback={`${index + 1}`} color={color} />
    </g>
  );
}

// Reference width the callout geometry (label boxes, text, arrows) is authored
// against. Giving the overlay <svg> a viewBox of this width makes every callout
// a constant FRACTION of the image instead of a fixed pixel size — so labels
// stay readable on the big lightbox yet shrink to fit tiny guide thumbnails,
// rather than swamping them.
//
// This MUST match the width the label boxes are sized for in boxGeom (≈ the
// fullscreen annotator's on-screen image width). If it's too large, the same
// pixel sizes become a tiny fraction of the viewBox and labels render dwarfed
// in the read-only views (preview / lightbox / thumbnails) even though they
// look right in the annotator. ~640 keeps the preview matched to the editor.
const ANNO_VBASE = 640;

/**
 * Read-only annotation overlay for a single image (viewer + editor thumbnails).
 * It sizes its own viewBox to the image's aspect ratio so the callouts scale
 * with however large the image is displayed — and because the computed viewBox
 * is a real attribute, it survives the lightbox's innerHTML clone too.
 *
 * `aspect` (width / height) seeds the server / no-JS render; on the client a
 * ResizeObserver refines it to the exact on-screen box. Renders nothing when
 * there are no annotations.
 */
export function AnnoOverlay({
  annos,
  aspect,
  callout = true,
}: {
  annos: Anno[];
  aspect?: number;
  callout?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<string | undefined>(
    aspect && aspect > 0
      ? `0 0 ${ANNO_VBASE} ${Math.round(ANNO_VBASE / aspect)}`
      : undefined
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        // Cap the viewBox at the actual on-screen width: big images keep the
        // authored fraction (labels scale up), but small images (gallery
        // thumbnails, phones) shrink the viewBox to ~display px so the same
        // label boxes stay a readable size instead of becoming microscopic.
        const w = Math.min(r.width, ANNO_VBASE);
        setVb(`0 0 ${Math.round(w)} ${Math.round((w * r.height) / r.width)}`);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (annos.length === 0) return null;
  return (
    <svg
      ref={ref}
      viewBox={vb}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {annos.map((a, i) => (
        <AnnoShape key={(a as any).id ?? i} anno={a} index={i} callout={callout} />
      ))}
    </svg>
  );
}
