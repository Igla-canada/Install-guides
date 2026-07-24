"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  archiveGuide,
  quickPublishGuide,
  restoreGuide,
} from "@/lib/guide-list-actions";
import HideFromCompatibilityToggle from "@/components/guides/hide-from-compatibility-toggle";

export type PeekGuide = {
  id: string;
  title: string;
  status: string;
  hideFromCompatibility: boolean;
  subtitle: string;
};

/**
 * Floating guide pop-in: narrow guide column over the dimmed list page.
 * No staff menu — only the guide document + a thin action strip.
 */
export default function GuidePeekPanel({
  guide,
  onClose,
  onStatusChange,
  onHideFromCompatibilityChange,
  fullHref,
  editHref,
}: {
  guide: PeekGuide;
  onClose: () => void;
  onStatusChange?: (id: string, status: string) => void;
  onHideFromCompatibilityChange?: (id: string, hidden: boolean) => void;
  fullHref: string;
  editHref: string;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState(guide.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setStatus(guide.status);
    setError(null);
  }, [guide.id, guide.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function run(
    action: () => Promise<{
      ok: boolean;
      status?: string;
      error?: string;
      conflictTitle?: string;
    }>,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(
          res.error === "conflict"
            ? `Another published guide already covers this vehicle/product${
                res.conflictTitle ? ` (“${res.conflictTitle}”)` : ""
              }.`
            : (res.error ?? "Something went wrong."),
        );
        return;
      }
      if (res.status) {
        setStatus(res.status);
        onStatusChange?.(guide.id, res.status);
      }
      router.refresh();
    });
  }

  const statusClass =
    status === "PUBLISHED"
      ? "bg-green-100 text-green-800"
      : status === "DRAFT"
        ? "bg-amber-100 text-amber-800"
        : "bg-zinc-200 text-zinc-700";

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/45 px-3 py-4 backdrop-blur-[2px] sm:px-6"
      onClick={onClose}
      role="presentation"
    >
      {/* Narrow guide column — list page stays visible on the sides */}
      <div
        className="flex h-[min(92vh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={guide.title}
      >
        <header className="flex shrink-0 flex-col gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass}`}>
            {status.toLowerCase()}
          </span>
          <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
            {guide.subtitle}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {status === "DRAFT" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => quickPublishGuide(guide.id))}
                className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                Publish
              </button>
            )}
            {status === "ARCHIVED" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => restoreGuide(guide.id))}
                className="rounded-md border border-zinc-600 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => archiveGuide(guide.id))}
                className="rounded-md border border-zinc-600 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                title="Hide from the main list — keeps a backup"
              >
                Archive
              </button>
            )}
            <Link
              href={fullHref}
              className="rounded-md border border-zinc-600 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Full page
            </Link>
            <Link
              href={editHref}
              className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-200"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          </div>
          <HideFromCompatibilityToggle
            guildId={guide.id}
            initialHidden={guide.hideFromCompatibility}
            variant="dark"
            onChange={(hidden) =>
              onHideFromCompatibilityChange?.(guide.id, hidden)
            }
          />
        </header>
        {error && (
          <p className="shrink-0 border-b border-amber-900/50 bg-amber-950/80 px-3 py-2 text-xs text-amber-100">
            {error}
          </p>
        )}
        <iframe
          title={guide.title}
          src={`/guide-peek/${guide.id}`}
          className="h-full min-h-0 w-full flex-1 border-0 bg-zinc-900"
        />
      </div>
    </div>,
    document.body,
  );
}
