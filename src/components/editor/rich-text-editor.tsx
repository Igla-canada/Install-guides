"use client";
// Inline rich-text editor for "text" blocks. A contentEditable surface plus a
// small toolbar (bold / italic / underline, size, colour, alignment) lets an
// author make any selected words stand out. We store the produced HTML on the
// block (c.html) AND a plaintext copy (c.text) for search / fallback; the
// viewer sanitises the HTML to a strict allowlist before showing it.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { RICH_ALLOWED_TAGS, RICH_ALLOWED_ATTR } from "@/lib/rich-text";

const COLORS = [
  "#111827", // near-black (default)
  "#ffffff", // white
  "#dc2626", // red
  "#ea580c", // orange
  "#16a34a", // green
  "#2563eb", // blue
  "#7c3aed", // purple
];

// execCommand fontSize takes 1–7; map readable labels to those buckets.
const SIZES: Array<[string, string]> = [
  ["Small", "2"],
  ["Normal", "3"],
  ["Large", "5"],
  ["XL", "7"],
];

export default function RichTextEditor({
  html,
  text,
  onChange,
}: {
  html?: string;
  text?: string;
  onChange: (next: { html: string; text: string }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Initialise the editable ONCE so typing/formatting never resets the caret.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (html && html.trim()) el.innerHTML = html;
    else if (text) el.textContent = text;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    const el = ref.current;
    if (!el) return;
    // Sanitise here (in the browser) to the strict allowlist, so only safe
    // inline-formatting markup is ever stored or later shown to an installer.
    const clean = DOMPurify.sanitize(el.innerHTML, {
      ALLOWED_TAGS: RICH_ALLOWED_TAGS,
      ALLOWED_ATTR: RICH_ALLOWED_ATTR,
    });
    const isEmpty = el.textContent?.trim() === "";
    onChange({ html: isEmpty ? "" : clean, text: el.innerText });
  };

  const cmd = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    save();
  };

  // The native colour picker steals focus from the editable (losing the
  // selection), so remember the selected range on mousedown and restore it
  // before applying the colour.
  const savedRange = useRef<Range | null>(null);
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const applyColor = (c: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    document.execCommand("foreColor", false, c);
    save();
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white focus-within:border-zinc-300">
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-100 px-1.5 py-1 text-sm">
        <ToolBtn title="Bold" onClick={() => cmd("bold")}>
          <span className="font-bold">B</span>
        </ToolBtn>
        <ToolBtn title="Italic" onClick={() => cmd("italic")}>
          <span className="italic">I</span>
        </ToolBtn>
        <ToolBtn title="Underline" onClick={() => cmd("underline")}>
          <span className="underline">U</span>
        </ToolBtn>

        <span className="mx-0.5 h-5 w-px bg-zinc-200" />

        <select
          title="Text size"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) cmd("fontSize", e.target.value);
            e.target.value = "";
          }}
          className="rounded-md border border-zinc-200 px-1.5 py-1 text-xs text-zinc-600"
        >
          <option value="" disabled>
            Size
          </option>
          {SIZES.map(([label, v]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>

        <span className="mx-0.5 h-5 w-px bg-zinc-200" />

        <div className="flex items-center gap-0.5" title="Text colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => cmd("foreColor", c)}
              className="h-5 w-5 rounded-full border border-zinc-300"
              style={{ backgroundColor: c }}
              aria-label={`Colour ${c}`}
            />
          ))}
          {/* Any custom colour. */}
          <label
            title="Custom colour — pick any"
            className="relative ml-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-zinc-300 text-[10px]"
            style={{
              background:
                "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)",
            }}
          >
            <input
              type="color"
              onMouseDown={saveSelection}
              onChange={(e) => applyColor(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Custom text colour"
            />
          </label>
        </div>

        <span className="mx-0.5 h-5 w-px bg-zinc-200" />

        <ToolBtn title="Bullet list" onClick={() => cmd("insertUnorderedList")}>
          <span className="text-xs">•≡</span>
        </ToolBtn>
        <ToolBtn title="Numbered list" onClick={() => cmd("insertOrderedList")}>
          <span className="text-xs">1.</span>
        </ToolBtn>

        <span className="mx-0.5 h-5 w-px bg-zinc-200" />

        <ToolBtn title="Align left" onClick={() => cmd("justifyLeft")}>
          ⬅
        </ToolBtn>
        <ToolBtn title="Align center" onClick={() => cmd("justifyCenter")}>
          ⬌
        </ToolBtn>
        <ToolBtn title="Align right" onClick={() => cmd("justifyRight")}>
          ➡
        </ToolBtn>

        <span className="mx-0.5 h-5 w-px bg-zinc-200" />

        <ToolBtn title="Clear formatting" onClick={() => cmd("removeFormat")}>
          <span className="text-xs text-zinc-500">clear</span>
        </ToolBtn>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={save}
        data-placeholder="Write… (select words and use the toolbar to style them)"
        className="rte-surface min-h-[60px] px-3 py-2 text-sm leading-relaxed focus:outline-none empty:before:text-zinc-400 empty:before:content-[attr(data-placeholder)] [&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5"
      />
    </div>
  );
}

function ToolBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      // Keep the text selection while clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-zinc-600 hover:bg-zinc-100"
    >
      {children}
    </button>
  );
}
