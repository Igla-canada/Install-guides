"use client";
// In a served guide the Igla settings can be long, so we don't dump them inline.
// Instead the settings block shows a "Click to see settings" button; clicking
// opens the full settings in a separate full-screen view with the guide name on
// top. Read-only (uses the shared IglaSettingsView). The parent page is already
// watermarked + audited — this just reveals already-served content.
import { useEffect, useState } from "react";
import IglaSettingsView from "./igla-settings-view";
import type { IglaSection } from "@/lib/igla-config";

type Content = { productName?: string; sections?: IglaSection[] };

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
  const rows = (content.sections ?? []).reduce((n, s) => n + s.rows.length, 0);

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
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
          dark
            ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
        }`}
      >
        <span className="flex items-center gap-2">
          <span>⚙</span>
          <span>
            Click to see settings
            {content.productName && (
              <span className={dark ? "text-zinc-400" : "text-zinc-500"}> · {content.productName}</span>
            )}
          </span>
        </span>
        <span className={`text-xs ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
          {rows} setting{rows === 1 ? "" : "s"} →
        </span>
      </button>

      {open && (
        <div className={`fixed inset-0 z-50 overflow-y-auto ${dark ? "bg-zinc-900" : "bg-zinc-50"}`}>
          <div
            className={`sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 ${
              dark ? "border-zinc-700 bg-zinc-900/95" : "border-zinc-200 bg-white/95"
            } backdrop-blur`}
          >
            <div className="min-w-0">
              <div className={`truncate text-base font-semibold ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
                {guildName}
              </div>
              <div className={`text-xs ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
                Igla settings{content.productName ? ` · ${content.productName}` : ""}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className={`ml-auto rounded-md border px-3 py-1.5 text-sm ${
                dark
                  ? "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              ✕ Close
            </button>
          </div>
          <div className="mx-auto max-w-3xl px-4 py-6">
            <IglaSettingsView content={content} dark={dark} />
            {watermarkLabel && (
              <p className={`mt-6 text-center text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
                Licensed to {watermarkLabel}. View-only — this access is recorded.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
