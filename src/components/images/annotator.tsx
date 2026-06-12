"use client";
// Annotation canvas: points/arrows/boxes dropped over the original photo, each
// with a label + description ("CAN-H — splice to pin 6, blue/white wire").
// Coordinates are stored normalized (0–1) so they survive any resize.
// Annotations are DATA over the image, never burned in — editable forever.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { saveAnnotations } from "@/lib/client/offline";

type Shape = "point" | "arrow" | "box";

export type Anno = {
  shape: Shape;
  coords: any; // point: {x,y}; arrow: {x1,y1,x2,y2}; box: {x,y,w,h}
  label: string;
  description?: string;
  color: string;
  order: number;
};

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];

export default function Annotator({
  imageRef,
  imageUrl,
  onClose,
}: {
  imageRef: string; // assetId or pending:<uuid>
  imageUrl: string;
  onClose: () => void;
}) {
  const [annos, setAnnos] = useState<Anno[]>([]);
  const [tool, setTool] = useState<Shape>("point");
  const [color, setColor] = useState(COLORS[0]);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Anno | null>(null);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (imageRef.startsWith("pending:")) return; // nothing server-side yet
    void fetch(`/api/images/${imageRef}/annotations`)
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((d) =>
        setAnnos(
          (d.annotations ?? []).map((a: any) => ({
            shape: a.shape,
            coords: a.coords,
            label: a.label,
            description: a.description ?? "",
            color: a.color,
            order: a.order,
          }))
        )
      );
  }, [imageRef]);

  const norm = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = norm(e);
    if (tool === "point") {
      const a: Anno = {
        shape: "point",
        coords: p,
        label: `${annos.length + 1}`,
        description: "",
        color,
        order: annos.length,
      };
      setAnnos([...annos, a]);
      setSelected(annos.length);
    } else {
      setDrag(p);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = norm(e);
    setDraft(
      tool === "arrow"
        ? {
            shape: "arrow",
            coords: { x1: drag.x, y1: drag.y, x2: p.x, y2: p.y },
            label: `${annos.length + 1}`,
            description: "",
            color,
            order: annos.length,
          }
        : {
            shape: "box",
            coords: {
              x: Math.min(drag.x, p.x),
              y: Math.min(drag.y, p.y),
              w: Math.abs(p.x - drag.x),
              h: Math.abs(p.y - drag.y),
            },
            label: `${annos.length + 1}`,
            description: "",
            color,
            order: annos.length,
          }
    );
  };

  const onPointerUp = () => {
    if (drag && draft) {
      setAnnos([...annos, draft]);
      setSelected(annos.length);
    }
    setDrag(null);
    setDraft(null);
  };

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-2 sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-xl bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2">
          <span className="text-sm font-medium">Annotate</span>
          {(["point", "arrow", "box"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`rounded-md px-2 py-1 text-sm ${
                tool === t ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"
              }`}
            >
              {t === "point" ? "● Point" : t === "arrow" ? "→ Arrow" : "▭ Box"}
            </button>
          ))}
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full border-2 ${
                  color === c ? "border-zinc-900" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
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
          <div className="relative min-h-0 flex-1 overflow-auto bg-zinc-900 p-2">
            <div className="relative inline-block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="w-full select-none" draggable={false} />
              <svg
                ref={svgRef}
                className="absolute inset-0 h-full w-full touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {[...annos, ...(draft ? [draft] : [])].map((a, i) => (
                  <AnnoShape
                    key={i}
                    anno={a}
                    index={i}
                    selected={selected === i}
                    onSelect={() => setSelected(i)}
                  />
                ))}
              </svg>
            </div>
          </div>

          {/* Label list */}
          <div className="max-h-56 w-full overflow-y-auto border-t border-zinc-200 sm:max-h-none sm:w-72 sm:border-l sm:border-t-0">
            {annos.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">
                Tap the photo to drop a point, or drag for arrows/boxes. Then
                label each marker here.
              </p>
            ) : (
              annos.map((a, i) => (
                <div
                  key={i}
                  className={`border-b border-zinc-100 p-3 ${
                    selected === i ? "bg-amber-50" : ""
                  }`}
                  onClick={() => setSelected(i)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: a.color }}
                    >
                      {i + 1}
                    </span>
                    <input
                      value={a.label}
                      onChange={(e) =>
                        setAnnos(
                          annos.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                        )
                      }
                      placeholder="Label (e.g. CAN-H)"
                      className="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1 text-sm font-medium"
                    />
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
                    onChange={(e) =>
                      setAnnos(
                        annos.map((x, j) =>
                          j === i ? { ...x, description: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Description (e.g. splice to pin 6, blue/white wire)"
                    rows={2}
                    className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  /** Viewer style: red-bordered label box with a leader line (reference look). */
  callout?: boolean;
}) {
  if (callout) return <CalloutShape anno={anno} index={index} />;
  const common = {
    onPointerDown: (e: React.PointerEvent) => {
      if (onSelect) {
        e.stopPropagation();
        onSelect();
      }
    },
    style: { cursor: onSelect ? "pointer" : undefined },
  };
  const pct = (v: number) => `${v * 100}%`;
  const stroke = selected ? 4 : 2.5;

  if (anno.shape === "point") {
    return (
      <g {...common}>
        <circle
          cx={pct(anno.coords.x)}
          cy={pct(anno.coords.y)}
          r={12}
          fill={anno.color}
          fillOpacity={0.9}
          stroke="#fff"
          strokeWidth={2}
        />
        <text
          x={pct(anno.coords.x)}
          y={pct(anno.coords.y)}
          dy="0.35em"
          textAnchor="middle"
          fill="#fff"
          fontSize={12}
          fontWeight={700}
        >
          {index + 1}
        </text>
      </g>
    );
  }
  if (anno.shape === "arrow") {
    const { x1, y1, x2, y2 } = anno.coords;
    return (
      <g {...common}>
        <defs>
          <marker
            id={`arrowhead-${index}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill={anno.color} />
          </marker>
        </defs>
        <line
          x1={pct(x1)}
          y1={pct(y1)}
          x2={pct(x2)}
          y2={pct(y2)}
          stroke={anno.color}
          strokeWidth={stroke}
          markerEnd={`url(#arrowhead-${index})`}
        />
        <circle cx={pct(x1)} cy={pct(y1)} r={10} fill={anno.color} stroke="#fff" strokeWidth={1.5} />
        <text
          x={pct(x1)}
          y={pct(y1)}
          dy="0.35em"
          textAnchor="middle"
          fill="#fff"
          fontSize={11}
          fontWeight={700}
        >
          {index + 1}
        </text>
      </g>
    );
  }
  // box
  const { x, y, w, h } = anno.coords;
  return (
    <g {...common}>
      <rect
        x={pct(x)}
        y={pct(y)}
        width={pct(w)}
        height={pct(h)}
        fill="none"
        stroke={anno.color}
        strokeWidth={stroke}
        rx={4}
      />
      <circle cx={pct(x)} cy={pct(y)} r={10} fill={anno.color} stroke="#fff" strokeWidth={1.5} />
      <text
        x={pct(x)}
        y={pct(y)}
        dy="0.35em"
        textAnchor="middle"
        fill="#fff"
        fontSize={11}
        fontWeight={700}
      >
        {index + 1}
      </text>
    </g>
  );
}

/**
 * The reference-page look: a red-bordered label box with a leader line down to
 * the wire/point. Multi-line labels supported via "\n" — the box grows.
 * Uses a nested <svg> so the box can be laid out in px around a % anchor.
 */
function CalloutShape({ anno, index }: { anno: Anno; index: number }) {
  const color = anno.color || "#ef4444";
  const label = (anno.label || `${index + 1}`).trim();
  const lines = label.split("\n").filter(Boolean);
  const boxW = Math.max(56, Math.max(...lines.map((l) => l.length)) * 7.2 + 18);
  const boxH = lines.length * 16 + 12;
  const pct = (v: number) => `${v * 100}%`;

  // Anchor (target on the photo) + where the label box sits.
  let target: { x: number; y: number };
  if (anno.shape === "point") target = anno.coords;
  else if (anno.shape === "arrow") target = { x: anno.coords.x2, y: anno.coords.y2 };
  else target = { x: anno.coords.x + anno.coords.w / 2, y: anno.coords.y };
  const labelOrigin =
    anno.shape === "arrow" ? { x: anno.coords.x1, y: anno.coords.y1 } : target;
  const below = labelOrigin.y < 0.18; // near the top edge → box goes below
  const gap = 28;
  const boxOffsetY = below ? gap : -(gap + boxH);

  return (
    <g>
      {anno.shape === "box" && (
        <rect
          x={pct(anno.coords.x)}
          y={pct(anno.coords.y)}
          width={pct(anno.coords.w)}
          height={pct(anno.coords.h)}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          rx={4}
        />
      )}
      {/* leader line + dot at the target */}
      <svg x={pct(labelOrigin.x)} y={pct(labelOrigin.y)} overflow="visible">
        <line
          x1={0}
          y1={below ? boxOffsetY : boxOffsetY + boxH}
          x2={0}
          y2={0}
          stroke={color}
          strokeWidth={2}
        />
        <g transform={`translate(${-boxW / 2}, ${boxOffsetY})`}>
          <rect
            width={boxW}
            height={boxH}
            rx={4}
            fill="rgba(20,20,20,0.92)"
            stroke={color}
            strokeWidth={2}
          />
          {lines.map((line, i) => (
            <text
              key={i}
              x={boxW / 2}
              y={16 + i * 16}
              textAnchor="middle"
              fill="#fff"
              fontSize={12}
              fontWeight={700}
            >
              {line}
            </text>
          ))}
        </g>
      </svg>
      <circle cx={pct(target.x)} cy={pct(target.y)} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
      {anno.shape === "arrow" && (
        <line
          x1={pct(anno.coords.x1)}
          y1={pct(anno.coords.y1)}
          x2={pct(anno.coords.x2)}
          y2={pct(anno.coords.y2)}
          stroke={color}
          strokeWidth={2}
        />
      )}
    </g>
  );
}
