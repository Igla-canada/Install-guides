"use client";
// Click any guide image to open it big in a zoomable lightbox so installers can
// read the wiring. Pinch (two fingers) or scroll/＋−/double-click to zoom; drag
// to pan. The clicked image's annotation overlay is cloned in, so callouts stay
// on the wires. On installer-facing views a per-view watermark is stamped over
// the zoomed image too (AGENTS.md #3 — a leaked screenshot stays traceable).
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";

type WM = { label: string; reference: string };

export default function ImageLightbox({ watermark }: { watermark?: WM }) {
  const [html, setHtml] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<
    | null
    | { startDist: number; startZoom: number; panX: number; panY: number; midX: number; midY: number }
  >(null);
  const drag = useRef<null | { x: number; y: number; panX: number; panY: number }>(null);
  const openRef = useRef(false);

  const close = () => {
    openRef.current = false;
    setHtml(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    pointers.current.clear();
    pinch.current = null;
    drag.current = null;
  };

  // Open on click of any zoomable image; clone its container (img + annotations).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (openRef.current) return; // already open — clicks inside drive zoom/pan
      const img = (e.target as HTMLElement | null)?.closest?.(
        "[data-zoomable]"
      ) as HTMLElement | null;
      if (!img) return;
      const container = img.parentElement;
      if (!container) return;
      openRef.current = true;
      setZoom(1);
      setPan({ x: 0, y: 0 });
      // Strip data-zoomable so the cloned image can't re-trigger this handler.
      setHtml(container.innerHTML.replaceAll("data-zoomable", "data-z"));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!html) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [html]);

  const clampPan = (z: number, px: number, py: number) => {
    const outer = outerRef.current;
    const c = contentRef.current;
    if (!outer || !c) return { x: px, y: py };
    const ow = outer.clientWidth;
    const oh = outer.clientHeight;
    const sw = c.offsetWidth * z;
    const sh = c.offsetHeight * z;
    // Allow centering when the content is smaller than the viewport.
    const minX = Math.min(0, ow - sw);
    const minY = Math.min(0, oh - sh);
    const maxX = Math.max(0, ow - sw);
    const maxY = Math.max(0, oh - sh);
    return {
      x: Math.min(maxX, Math.max(minX, px)),
      y: Math.min(maxY, Math.max(minY, py)),
    };
  };

  const zoomToCenter = (z: number) => {
    const nz = Math.min(6, Math.max(1, z));
    const outer = outerRef.current;
    if (!outer || nz === 1) {
      setZoom(nz);
      setPan({ x: 0, y: 0 });
      return;
    }
    const cx = outer.clientWidth / 2;
    const cy = outer.clientHeight / 2;
    const ux = (cx - pan.x) / zoom;
    const uy = (cy - pan.y) / zoom;
    setZoom(nz);
    setPan(clampPan(nz, cx - nz * ux, cy - nz * uy));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      drag.current = null;
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
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size >= 2) {
      const outer = outerRef.current;
      if (!outer) return;
      const o = outer.getBoundingClientRect();
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const nz = Math.min(6, Math.max(1, (pinch.current.startZoom * dist) / pinch.current.startDist));
      const midX = (pts[0].x + pts[1].x) / 2 - o.left;
      const midY = (pts[0].y + pts[1].y) / 2 - o.top;
      const ux = (pinch.current.midX - o.left - pinch.current.panX) / pinch.current.startZoom;
      const uy = (pinch.current.midY - o.top - pinch.current.panY) / pinch.current.startZoom;
      setZoom(nz);
      setPan(nz === 1 ? { x: 0, y: 0 } : clampPan(nz, midX - nz * ux, midY - nz * uy));
      return;
    }
    if (drag.current) {
      setPan(
        clampPan(
          zoom,
          drag.current.panX + (e.clientX - drag.current.x),
          drag.current.panY + (e.clientY - drag.current.y)
        )
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const outer = outerRef.current;
    if (!outer) return;
    const o = outer.getBoundingClientRect();
    const nz = Math.min(6, Math.max(1, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (nz === 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const cx = e.clientX - o.left;
    const cy = e.clientY - o.top;
    const ux = (cx - pan.x) / zoom;
    const uy = (cy - pan.y) / zoom;
    setZoom(nz);
    setPan(clampPan(nz, cx - nz * ux, cy - nz * uy));
  };

  if (!html) return null;

  const stamp = watermark
    ? `${watermark.label} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${watermark.reference}`
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90">
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-white">
        <span className="text-white/60">Drag to pan · scroll / pinch to zoom</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => zoomToCenter(zoom - 0.5)}
            disabled={zoom <= 1}
            className="rounded-md border border-white/30 px-2 py-1 leading-none disabled:opacity-40"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-white/70">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => zoomToCenter(zoom + 0.5)}
            disabled={zoom >= 6}
            className="rounded-md border border-white/30 px-2 py-1 leading-none disabled:opacity-40"
          >
            +
          </button>
          <button
            onClick={close}
            className="ml-2 rounded-md border border-white/30 px-3 py-1 hover:bg-white/10"
          >
            ✕ Close
          </button>
        </div>
      </div>

      <div
        ref={outerRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={() => zoomToCenter(zoom > 1 ? 1 : 2.5)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        style={{ cursor: zoom > 1 ? "grab" : "zoom-in" }}
      >
        <div
          ref={contentRef}
          className="absolute left-0 top-0 w-full select-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {stamp && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="absolute whitespace-nowrap text-sm font-medium"
                style={{
                  top: `${i * 9}%`,
                  left: i % 2 === 0 ? "-10%" : "-25%",
                  width: "150%",
                  transform: "rotate(-20deg)",
                  color: "rgba(255,255,255,0.10)",
                  letterSpacing: "0.05em",
                }}
              >
                {Array.from({ length: 6 })
                  .map(() => stamp)
                  .join("      ")}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
