"use client";

import { useState } from "react";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function previewLine(text: string, html: string, max = 100): string {
  const plain = text.trim() || stripHtml(html);
  const first = plain.split(/\n/).find((l) => l.trim()) ?? "";
  if (first.length <= max) return first;
  return `${first.slice(0, max - 1)}…`;
}

/** Optional collapse for long text blocks — closed by default when enabled. */
export default function CollapsibleRichText({
  html,
  text,
  className,
  mutedClassName = "text-zinc-400",
  forceOpen = false,
}: {
  html?: unknown;
  text?: unknown;
  className: string;
  mutedClassName?: string;
  /** PDF / print — always show full body. */
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;

  const h = typeof html === "string" ? html.trim() : "";
  const plain = typeof text === "string" ? text : "";
  const summary = previewLine(plain, h);

  const body = h ? (
    <div
      className={`${className} [&_div]:my-0 [&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5`}
      dangerouslySetInnerHTML={{ __html: h }}
    />
  ) : (
    <p className={`${className} whitespace-pre-wrap`}>{plain}</p>
  );

  if (forceOpen) return body;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 rounded-md py-0.5 text-left"
        aria-expanded={isOpen}
      >
        <span className="mt-0.5 shrink-0 text-zinc-400" aria-hidden>
          {isOpen ? "▼" : "▶"}
        </span>
        {!isOpen && (
          <span className={`min-w-0 flex-1 text-sm leading-relaxed ${mutedClassName}`}>
            {summary || "Expand text"}
          </span>
        )}
      </button>
      {isOpen && <div className="mt-1 pl-5">{body}</div>}
    </div>
  );
}
