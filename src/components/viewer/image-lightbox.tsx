"use client";
// Click any guide image to open it big in a zoomable lightbox so installers can
// read the wiring. Pinch (two fingers) or scroll/＋−/double-click to zoom; drag
// to pan. The clicked image's annotation overlay is cloned in, so callouts stay
// on the wires. On installer-facing views a per-view watermark is stamped over
// the zoomed image too (AGENTS.md #3 — a leaked screenshot stays traceable).
import { useEffect, useRef, useState } from "react";
import {
  ZOOM_STEPS,
  clampZoom,
  defaultOpenZoom,
  maxZoom,
  minZoomForViewport,
} from "@/lib/image-zoom";
import { watermarkStamp } from "@/lib/watermark";

type WM = { label: string; reference: string };

// Em-spaces (U+2003) between repeats — plain spaces collapse to one in HTML.
const WM_GAP = "\u2003\u2003\u2003";

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
  const gesturePinched = useRef(false);
  const openZoomRef = useRef(1);
  const openRef = useRef(false);

  const minZoom = minZoomForViewport();

  const close = () => {
    openRef.current = false;
    setHtml(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    pointers.current.clear();
    pinch.current = null;
    drag.current = null;
    gesturePinched.current = false;
  };

  const clampPan = (z: number, px: number, py: number) => {
    const outer = outerRef.current;
    const c = contentRef.current;
    if (!outer || !c) return { x: px, y: py };
    const ow = outer.clientWidth;
    const oh = outer.clientHeight;
    const sw = c.offsetWidth * z;
    const sh = c.offsetHeight * z;
    const axis = (o: number, s: number, p: number) =>
      s <= o ? (o - s) / 2 : Math.min(0, Math.max(o - s, p));
    return { x: axis(ow, sw, px), y: axis(oh, sh, py) };
  };

  const centerAtZoom = (z: number) => {
    setPan((p) => clampPan(z, p.x, p.y));
  };

  // Open on click of any zoomable image; clone its container (img + annotations).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (openRef.current) return;
      const img = (e.target as HTMLElement | null)?.closest?.(
        "[data-zoomable]"
      ) as HTMLElement | null;
      if (!img) return;
      const container = img.parentElement;
      if (!container) return;
      openRef.current = true;
      const z0 = defaultOpenZoom();
      openZoomRef.current = z0;
      setZoom(z0);
      setPan({ x: 0, y: 0 });
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

  // Center once the cloned image has laid out.
  useEffect(() => {
    if (!html) return;
    const z0 = openZoomRef.current;
    const id = requestAnimationFrame(() => centerAtZoom(z0));
    const img = contentRef.current?.querySelector("img");
    const onLoad = () => centerAtZoom(z0);
    img?.addEventListener("load", onLoad);
    return () => {
      cancelAnimationFrame(id);
      img?.removeEventListener("load", onLoad);
    };
  }, [html]);

  useEffect(() => {
    if (!html) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    const el = outerRef.current;
    const stop = (e: WheelEvent) => e.preventDefault();
    el?.addEventListener("wheel", stop, { passive: false });
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      el?.removeEventListener("wheel", stop);
    };
  }, [html]);

  const zoomToCenter = (z: number) => {
    const nz = clampZoom(z);
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
    const ni = Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + dir));
    zoomToCenter(ZOOM_STEPS[ni]!);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") e.preventDefault();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      gesturePinched.current = true;
      drag.current = null;
      const pts = [...pointers.current.values()];
      pinch.current = {
        startDist: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) || 1,
        startZoom: zoom,
        panX: pan.x,
        panY: pan.y,
        midX: (pts[0]!.x + pts[1]!.x) / 2,
        midY: (pts[0]!.y + pts[1]!.y) / 2,
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
      e.preventDefault();
      const outer = outerRef.current;
      if (!outer) return;
      const o = outer.getBoundingClientRect();
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) || 1;
      const nz = clampZoom(
        (pinch.current.startZoom * dist) / pinch.current.startDist,
      );
      const midX = (pts[0]!.x + pts[1]!.x) / 2 - o.left;
      const midY = (pts[0]!.y + pts[1]!.y) / 2 - o.top;
      const ux =
        (pinch.current.midX - o.left - pinch.current.panX) /
        pinch.current.startZoom;
      const uy =
        (pinch.current.midY - o.top - pinch.current.panY) /
        pinch.current.startZoom;
      setZoom(nz);
      setPan(clampPan(nz, midX - nz * ux, midY - nz * uy));
      return;
    }
    if (gesturePinched.current) return;
    if (drag.current) {
      setPan(
        clampPan(
          zoom,
          drag.current.panX + (e.clientX - drag.current.x),
          drag.current.panY + (e.clientY - drag.current.y),
        ),
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      if (gesturePinched.current) gesturePinched.current = false;
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const outer = outerRef.current;
    if (!outer) return;
    const o = outer.getBoundingClientRect();
    const nz = clampZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    const cx = e.clientX - o.left;
    const cy = e.clientY - o.top;
    const ux = (cx - pan.x) / zoom;
    const uy = (cy - pan.y) / zoom;
    setZoom(nz);
    setPan(clampPan(nz, cx - nz * ux, cy - nz * uy));
  };

  if (!html) return null;

  const stamp = watermark ? watermarkStamp(watermark.label, watermark.reference) : null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90">
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-white">
        <span className="text-white/60">Drag to pan · pinch / scroll to zoom</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => stepZoom(-1)}
            disabled={zoom <= minZoom}
            className="rounded-md border border-white/30 px-2 py-1 leading-none disabled:opacity-40"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-white/70">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => stepZoom(1)}
            disabled={zoom >= maxZoom()}
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
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden overscroll-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={() => zoomToCenter(zoom > 1 ? 1 : maxZoom())}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        style={{
          cursor: zoom > 1 ? "grab" : "zoom-in",
          WebkitTouchCallout: "none",
          touchAction: "none",
        }}
      >
        <div
          ref={contentRef}
          className="absolute left-0 top-0 w-full select-none [&_img]:max-w-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {stamp && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="absolute whitespace-nowrap text-sm font-medium"
                style={{
                  top: `${i * 12}%`,
                  left: "-25%",
                  width: "150%",
                  transform: "rotate(-20deg)",
                  color: "rgba(255,255,255,0.10)",
                  letterSpacing: "0.06em",
                }}
              >
                {Array.from({ length: 5 }).map(() => stamp).join(WM_GAP)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
