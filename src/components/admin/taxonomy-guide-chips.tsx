"use client";

import { useState } from "react";
import GuidePeekPanel, {
  type PeekGuide,
} from "@/components/guides/guide-peek-panel";
import { withFromParam } from "@/lib/guides-nav";

export type TaxGuideChip = {
  id: string;
  title: string;
  status: string;
  hideFromCompatibility: boolean;
  subtitle: string;
  /** Shown after the title for ghost / bridged chips. */
  note?: string;
};

/**
 * Guide chips in Vehicle taxonomy — open the same floating peek as /guides
 * (close stays on this page; Edit goes to the editor).
 */
export default function TaxonomyGuideChips({
  guides,
  label,
  accentColor,
  ghost = false,
}: {
  guides: TaxGuideChip[];
  label?: string;
  accentColor?: string;
  ghost?: boolean;
}) {
  const [peek, setPeek] = useState<PeekGuide | null>(null);
  if (guides.length === 0) return null;

  const from = "/users?tab=taxonomy";

  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {label ? (
          <span className="text-[11px] text-zinc-400">{label}</span>
        ) : null}
        {guides.map((gd) => (
          <button
            key={gd.id}
            type="button"
            onClick={() =>
              setPeek({
                id: gd.id,
                title: gd.title,
                status: gd.status,
                hideFromCompatibility: gd.hideFromCompatibility,
                subtitle: gd.subtitle,
              })
            }
            title={`Preview “${gd.title}” — Edit opens the editor`}
            className={
              ghost
                ? "inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-300 bg-white px-2 py-0.5 text-left text-xs text-zinc-500 hover:bg-zinc-100"
                : "inline-flex items-center gap-1 rounded-md border-l-4 border border-zinc-200 bg-white px-2 py-0.5 text-left text-xs hover:bg-zinc-100"
            }
            style={
              !ghost && accentColor
                ? { borderLeftColor: accentColor }
                : undefined
            }
          >
            {ghost ? <span className="opacity-50">⤳</span> : <span>↗</span>}
            {gd.title}
            {gd.note && (
              <span className="text-[10px] text-zinc-400">{gd.note}</span>
            )}
            {gd.status !== "PUBLISHED" && (
              <span className="text-[10px] text-zinc-400">
                ({gd.status.toLowerCase()})
              </span>
            )}
          </button>
        ))}
      </div>
      {peek && (
        <GuidePeekPanel
          guide={peek}
          onClose={() => setPeek(null)}
          onStatusChange={(id, status) => {
            setPeek((p) => (p && p.id === id ? { ...p, status } : p));
          }}
          onHideFromCompatibilityChange={(id, hidden) => {
            setPeek((p) =>
              p && p.id === id ? { ...p, hideFromCompatibility: hidden } : p,
            );
          }}
          fullHref={withFromParam(`/guides/${peek.id}`, from)}
          editHref={withFromParam(`/guides/${peek.id}/edit`, from)}
        />
      )}
    </>
  );
}
