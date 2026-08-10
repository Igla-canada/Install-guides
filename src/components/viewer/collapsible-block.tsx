"use client";

import { useState } from "react";

/** Wrap any block — closed by default; inherits normal text colour (not grayed out). */
export default function CollapsibleBlock({
  preview,
  children,
  forceOpen = false,
  textClassName = "",
}: {
  preview: string;
  children: React.ReactNode;
  forceOpen?: boolean;
  textClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;

  if (forceOpen) return <>{children}</>;

  if (isOpen) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`mb-2 flex items-center gap-2 text-sm ${textClassName}`}
          aria-expanded
        >
          <span aria-hidden>▼</span>
          <span className="rounded-md border border-current/25 px-2 py-0.5 text-xs font-medium opacity-80">
            Click to close
          </span>
        </button>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`flex w-full items-center gap-3 rounded-lg border border-current/20 bg-current/[0.04] px-3 py-2.5 text-left transition hover:bg-current/[0.08] ${textClassName}`}
      aria-expanded={false}
    >
      <span className="shrink-0 text-base leading-none opacity-80" aria-hidden>
        ▶
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug">{preview}</span>
      <span className="shrink-0 rounded-md border border-current/30 bg-current/[0.06] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
        Click to open
      </span>
    </button>
  );
}
