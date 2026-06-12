"use client";
// The preview editing surface + chat surface over ONE canonical document.
// All edits — from either surface — flow through dispatch() below, which posts
// operations to /api/guilds/[id]/ops (or queues them offline). Chat never
// holds its own copy of the document (AGENTS.md #2).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
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
import PropertiesEditor from "./properties-editor";
import ChatPanel from "./chat-panel";
import { SECTION_TYPES } from "@/lib/blocks";

export default function GuildEditor({
  initialDoc,
  taxonomy,
  versions,
  quickPicks,
  publishAction,
  rollbackAction,
  publishError,
}: {
  initialDoc: ClientDoc;
  taxonomy: Taxonomy;
  versions: ClientVersion[];
  quickPicks: ClientQuickPick[];
  publishAction: () => Promise<void>;
  rollbackAction: (formData: FormData) => Promise<void>;
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

  const dispatch = useCallback(
    async (ops: any[]) => {
      // Optimistic local apply; server doc replaces it on success.
      setDoc((d) => applyOpsLocal(d, ops));
      const result = await dispatchOps(initialDoc.id, ops);
      if (result.ok && result.doc) setDoc(result.doc as ClientDoc);
    },
    [initialDoc.id]
  );

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
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/guilds" className="text-sm text-zinc-500 hover:underline">
          ← Guilds
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
            href={`/print/${doc.id}`}
            target="_blank"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
            title="Internal export — installer-facing views never offer downloads"
          >
            Export
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
        </div>
      </div>

      {publishError === "conflict" && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Another <strong>published</strong> guild already exists for this exact
          vehicle + product + region. Archive it or change this guild&apos;s
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
                  <form action={rollbackAction} className="ml-auto">
                    <input type="hidden" name="versionNo" value={v.versionNo} />
                    <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                      Restore this version
                    </button>
                  </form>
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
        {/* Document (preview editor) */}
        <div className={`min-w-0 flex-1 ${tab === "chat" ? "hidden lg:block" : ""}`}>
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

        {/* Chat surface */}
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
