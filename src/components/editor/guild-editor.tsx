"use client";
// The preview editing surface + chat surface over ONE canonical document.
// All edits — from either surface — flow through dispatch() below, which posts
// operations to /api/guilds/[id]/ops (or queues them offline). Chat never
// holds its own copy of the document (AGENTS.md #2).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  dispatchOps,
  flushQueue,
  onQueueChange,
  queuedCount,
} from "@/lib/client/offline";
import { applyOpsLocal } from "./local-apply";
import type { ClientDoc, ClientQuickPick, ClientVersion } from "./types";
import type { Taxonomy } from "@/lib/taxonomy";
import SectionCard from "./section-card";
import IdentityPanel from "./identity-panel";
import OutlinePanel from "./outline-panel";
import CoverEditor from "./cover-editor";
import PropertiesEditor from "./properties-editor";
import ChatPanel from "./chat-panel";
import { SECTION_TYPES } from "@/lib/blocks";

// The undo payload: the content that restore_content rewrites (identity FKs are
// not touched — they have their own staged Save/Discard).
function contentSnapshot(d: ClientDoc) {
  return {
    title: d.title,
    properties: d.properties,
    coverImageId: d.coverImageId,
    sections: d.sections.map((s) => ({
      title: s.title,
      type: s.type,
      collapsedDefault: s.collapsedDefault,
      blocks: s.blocks.map((b) => ({ type: b.type, content: b.content })),
    })),
  };
}

export default function GuildEditor({
  initialDoc,
  taxonomy,
  versions,
  quickPicks,
  publishAction,
  rollbackAction,
  unpublishAction,
  archiveAction,
  deleteAction,
  isAdmin,
  publishError,
}: {
  initialDoc: ClientDoc;
  taxonomy: Taxonomy;
  versions: ClientVersion[];
  quickPicks: ClientQuickPick[];
  publishAction: () => Promise<void>;
  rollbackAction: (formData: FormData) => Promise<void>;
  unpublishAction: () => Promise<void>;
  archiveAction: () => Promise<void>;
  deleteAction: () => Promise<void>;
  isAdmin: boolean;
  publishError?: string;
  currentUserId: string;
}) {
  const [doc, setDoc] = useState<ClientDoc>(initialDoc);
  const [pending, setPending] = useState(0);
  const [tab, setTab] = useState<"edit" | "preview" | "chat">("edit");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Undo (Ctrl/Cmd+Z): snapshot the doc BEFORE each edit; undo restores the last
  // snapshot by rewriting the content (a restore_content op). Kept in refs so it
  // doesn't churn renders; a count drives the button's enabled state.
  const docRef = useRef(doc);
  docRef.current = doc;
  const undoStack = useRef<ClientDoc[]>([]);
  const undoing = useRef(false);
  const [undoCount, setUndoCount] = useState(0);

  const dispatch = useCallback(
    async (ops: any[]) => {
      if (!undoing.current) {
        undoStack.current.push(JSON.parse(JSON.stringify(docRef.current)));
        if (undoStack.current.length > 50) undoStack.current.shift();
        setUndoCount(undoStack.current.length);
      }
      // Optimistic local apply; server doc replaces it on success.
      setDoc((d) => applyOpsLocal(d, ops));
      const result = await dispatchOps(initialDoc.id, ops);
      if (result.ok && result.doc) setDoc(result.doc as ClientDoc);
    },
    [initialDoc.id]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!prev) return;
    undoing.current = true;
    void dispatch([{ op: "restore_content", snapshot: contentSnapshot(prev) }]);
    undoing.current = false; // dispatch's push-skip check already ran synchronously
  }, [dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isZ = e.key === "z" || e.key === "Z";
      if ((e.ctrlKey || e.metaKey) && isZ && !e.shiftKey && !e.altKey) {
        // Let inputs / contentEditable keep their own native undo while focused.
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
          return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  useEffect(() => {
    const update = () => void queuedCount().then(setPending);
    update();
    const off = onQueueChange(update);
    void flushQueue();
    return off;
  }, []);

  const addSection = (type: string, label: string) => {
    setAddSectionOpen(false);
    void dispatch([
      {
        op: "add_section",
        sectionId: crypto.randomUUID(),
        title: label,
        type,
      },
    ]);
  };

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header — sticky under the global nav so Publish & friends stay reachable
          no matter how far you scroll. */}
      <div className="sticky top-12 z-30 -mx-4 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur">
        <Link href={`/guides/${doc.id}`} className="text-sm text-zinc-500 hover:underline">
          ← Done / preview
        </Link>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            doc.status === "PUBLISHED"
              ? "bg-green-100 text-green-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {doc.status.toLowerCase()}
        </span>
        {pending > 0 && (
          <button
            onClick={() => void flushQueue()}
            className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800"
            title="Changes saved on this device, waiting for connection. Tap to retry."
          >
            ⟳ {pending} change{pending > 1 ? "s" : ""} waiting to sync
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={undo}
            disabled={undoCount === 0}
            title="Undo (Ctrl/Cmd+Z)"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40"
          >
            ↶ Undo
          </button>
          <button
            onClick={() => {
              setPreviewNonce((n) => n + 1);
              setTab(tab === "preview" ? "edit" : "preview");
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === "preview"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 hover:bg-zinc-100"
            }`}
            title="See exactly what an installer will see"
          >
            {tab === "preview" ? "← Back to editing" : "👁 Preview"}
          </button>
          <Link
            href={`/export/pdf?ids=${doc.id}`}
            target="_blank"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
            title="Internal export — installer-facing views never offer downloads"
          >
            ⬇ PDF
          </Link>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
          >
            History ({versions.length})
          </button>
          <form action={publishAction}>
            <button className="rounded-md bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-600">
              {doc.status === "PUBLISHED" ? "Publish update" : "Publish"}
            </button>
          </form>
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm hover:bg-zinc-100"
              title="More actions"
            >
              ⋯
            </button>
            {moreOpen && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
                {doc.status === "PUBLISHED" && (
                  <form action={unpublishAction}>
                    <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100">
                      ↩ Unpublish (back to draft)
                      <span className="block text-xs text-zinc-400">
                        Take it off installers &amp; the Igla app to keep editing;
                        nothing is lost
                      </span>
                    </button>
                  </form>
                )}
                <form action={archiveAction}>
                  <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100">
                    {doc.status === "ARCHIVED" ? "↩ Restore from archive" : "🗄 Archive"}
                    <span className="block text-xs text-zinc-400">
                      {doc.status === "ARCHIVED"
                        ? "Back to draft — publish again to serve it"
                        : "Hide from installers & the Igla app; nothing is lost"}
                    </span>
                  </button>
                </form>
                {isAdmin && (
                  <form
                    action={deleteAction}
                    onSubmit={(e) => {
                      if (
                        !confirm(
                          `Permanently delete "${doc.title}"?\n\nThis removes the guide, its photos, versions and access links. It cannot be undone — use Archive if you might need it again.`
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <button className="w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                      🗑 Delete permanently
                      <span className="block text-xs text-red-300">
                        Admin only · cannot be undone
                      </span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {doc.status === "ARCHIVED" && (
        <p className="mt-3 rounded-md bg-zinc-200 px-3 py-2 text-sm text-zinc-600">
          🗄 This guide is archived — installers and the Igla app can&apos;t see
          it. Restore it from the ⋯ menu, or publish to make it live again.
        </p>
      )}

      {publishError === "conflict" && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Another <strong>published</strong> guide already exists for this exact
          vehicle + product + region. Archive it or change this guide&apos;s
          identity before publishing.
        </p>
      )}

      {showHistory && (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-medium">Version history</h3>
          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              No published versions yet. Publishing creates a snapshot you can
              always roll back to.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="font-medium">v{v.versionNo}</span>
                  <span className="text-zinc-500">
                    {new Date(v.createdAt).toLocaleString()} · {v.createdBy.name}
                    {v.note ? ` · ${v.note}` : ""}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Link
                      href={`/guides/${doc.id}/version/${v.versionNo}`}
                      target="_blank"
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                    >
                      👁 Preview
                    </Link>
                    <form action={rollbackAction}>
                      <input type="hidden" name="versionNo" value={v.versionNo} />
                      <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                        Restore
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Mobile tab switch */}
      <div className="mt-4 flex gap-1 rounded-lg bg-zinc-200 p-1 lg:hidden">
        {(["edit", "preview", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              if (t === "preview") setPreviewNonce((n) => n + 1);
              setTab(t);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t ? "bg-white shadow-sm" : "text-zinc-600"
            }`}
          >
            {t === "edit" ? "Edit" : t === "preview" ? "Preview" : "Chat"}
          </button>
        ))}
      </div>

      {/* Installer-eye preview: the real renderer, dark theme, in an iframe */}
      {tab === "preview" && (
        <iframe
          key={previewNonce}
          src={`/preview/${doc.id}`}
          className="mt-4 h-[78vh] w-full rounded-xl border border-zinc-300 bg-zinc-900"
          title="Installer preview"
        />
      )}

      <div className={`mt-4 flex gap-6 ${tab === "preview" ? "hidden" : ""}`}>
        {/* Layer view (left, desktop) — sticky outline of sections + blocks */}
        <div className="hidden lg:block lg:w-72 lg:shrink-0">
          <div className="lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            <OutlinePanel doc={doc} dispatch={dispatch} />
          </div>
        </div>

        {/* Document (preview editor) — middle */}
        <div className={`min-w-0 flex-1 ${tab === "chat" ? "hidden lg:block" : ""}`}>
          <CoverEditor doc={doc} dispatch={dispatch} />
          <IdentityPanel
            doc={doc}
            taxonomy={taxonomy}
            open={showIdentity}
            onToggle={() => setShowIdentity((v) => !v)}
            dispatch={dispatch}
          />
          <PropertiesEditor doc={doc} dispatch={dispatch} />

          <div className="mt-4 space-y-4">
            {doc.sections.map((section, i) => (
              <SectionCard
                key={section.id}
                section={section}
                index={i}
                total={doc.sections.length}
                guildId={doc.id}
                dispatch={dispatch}
                quickPicks={quickPicks}
              />
            ))}
          </div>

          <div className="relative mt-4">
            <button
              onClick={() => setAddSectionOpen((v) => !v)}
              className="w-full rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
            >
              + Add section
            </button>
            {addSectionOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {SECTION_TYPES.map((t) => (
                    <button
                      key={t.type}
                      onClick={() => addSection(t.type, t.label)}
                      className="rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat surface — right, sticky */}
        <div
          className={`w-full lg:w-96 lg:shrink-0 ${
            tab === "edit" ? "hidden lg:block" : ""
          }`}
        >
          <ChatPanel doc={doc} dispatch={dispatch} quickPicks={quickPicks} />
        </div>
      </div>
    </div>
  );
}
