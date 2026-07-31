"use client";
// In a served guide the Igla settings can be long, so we don't dump them inline.
// "Click to see settings" opens a floating panel over the dimmed guide — same
// pattern as the image lightbox / guide-list peek (centered card, Escape / backdrop
// to close). Read-only; the parent page is already watermarked + audited.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import IglaSettingsView from "./igla-settings-view";
import type { IglaSection } from "@/lib/igla-config";

type Content = {
  productName?: string;
  flasherVariant?: "current" | "old";
  sections?: IglaSection[];
};

export default function IglaSettingsLauncher({
  content,
  guildName,
  dark = false,
  watermarkLabel,
}: {
  content: Content;
  guildName: string;
  dark?: boolean;
  watermarkLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rows = (content.sections ?? []).reduce((n, s) => n + s.rows.length, 0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if ((content.sections ?? []).length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-4 text-left text-sm font-semibold shadow-md transition hover:brightness-110 active:scale-[0.99] ${
          dark
            ? "border-orange-400/80 bg-orange-500 text-white shadow-orange-950/40 hover:bg-orange-400"
            : "border-orange-600 bg-orange-500 text-white shadow-orange-200 hover:bg-orange-600"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${
              dark ? "bg-black/20" : "bg-white/20"
            }`}
            aria-hidden
          >
            ⚙
          </span>
          <span className="min-w-0">
            <span className="block">Click to see settings</span>
            {(content.productName || content.flasherVariant === "old") && (
              <span className="block truncate text-xs font-normal text-white/85">
                {[
                  content.productName,
                  content.flasherVariant === "old" ? "Old flasher" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </span>
        </span>
        <span className="ml-3 shrink-0 rounded-full bg-black/15 px-2.5 py-1 text-xs font-medium text-white">
          {rows} setting{rows === 1 ? "" : "s"} →
        </span>
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/45 px-3 py-4 backdrop-blur-[2px] sm:px-6"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              className={`flex h-[min(92vh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl ${
                dark
                  ? "border-zinc-700/80 bg-zinc-950"
                  : "border-zinc-200 bg-zinc-50"
              }`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Igla settings — ${guildName}`}
            >
              <header
                className={`flex shrink-0 items-center gap-3 border-b px-4 py-3 ${
                  dark
                    ? "border-zinc-800 bg-zinc-950"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-base font-semibold ${
                      dark ? "text-zinc-100" : "text-zinc-900"
                    }`}
                  >
                    {guildName}
                  </div>
                  <div
                    className={`text-xs ${dark ? "text-zinc-400" : "text-zinc-500"}`}
                  >
                    Igla settings
                    {content.productName ? ` · ${content.productName}` : ""}
                    {content.flasherVariant === "old" ? " · Old flasher" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-sm ${
                    dark
                      ? "border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  ✕ Close
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <IglaSettingsView content={content} dark={dark} />
                {watermarkLabel && (
                  <p
                    className={`mt-6 text-center text-xs ${
                      dark ? "text-zinc-500" : "text-zinc-400"
                    }`}
                  >
                    Licensed to {watermarkLabel}. View-only — this access is
                    recorded.
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
