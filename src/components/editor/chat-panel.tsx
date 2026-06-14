"use client";
// Chat authoring surface. One question at a time; every answer becomes an
// operation dispatched through the SAME dispatch() as the preview editor —
// the message list below is presentation only, never document state
// (AGENTS.md #2). The user can jump to the preview at any moment; both
// surfaces stay consistent because there is only one document.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import type { ClientDoc, ClientQuickPick } from "./types";
import { SECTION_TYPES, defaultContent } from "@/lib/blocks";
import { uploadImage } from "@/lib/client/offline";

type Msg = { from: "bot" | "user"; text: string };

type Mode =
  | { kind: "menu" }
  | { kind: "pick_section_type" }
  | {
      kind: "pick_target_section";
      then: "text" | "photo" | "file" | "checklist" | "callout" | "quick_pick";
      pickId?: string;
    }
  | { kind: "write_text"; sectionId: string }
  | { kind: "rename_title" };

export default function ChatPanel({
  doc,
  dispatch,
  quickPicks,
}: {
  doc: ClientDoc;
  dispatch: (ops: any[]) => Promise<void>;
  quickPicks: ClientQuickPick[];
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      from: "bot",
      text:
        doc.sections.reduce((n, s) => n + s.blocks.length, 0) === 0
          ? `Let's build the guide for ${doc.make.name} ${doc.model.name} ${doc.generation.name}. What do you want to do first?`
          : `Back to "${doc.title}". What should we change?`,
    },
  ]);
  const [mode, setMode] = useState<Mode>({ kind: "menu" });
  const [input, setInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const anyFileRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const say = (text: string) => setMessages((m) => [...m, { from: "bot", text }]);
  const echo = (text: string) => setMessages((m) => [...m, { from: "user", text }]);

  const backToMenu = (confirmation: string) => {
    say(confirmation);
    setMode({ kind: "menu" });
  };

  // --- actions -------------------------------------------------------------

  const addSection = async (type: string, label: string) => {
    echo(label);
    await dispatch([
      { op: "add_section", sectionId: crypto.randomUUID(), title: label, type },
    ]);
    backToMenu(`Added the "${label}" section — you can see it in the page. What's next?`);
  };

  const addTextBlock = async (sectionId: string, text: string) => {
    await dispatch([
      {
        op: "add_block",
        blockId: crypto.randomUUID(),
        sectionId,
        type: "text",
        content: { text },
      },
    ]);
    backToMenu("Added. Anything else?");
  };

  const addBlockOfType = async (sectionId: string, type: string) => {
    await dispatch([
      {
        op: "add_block",
        blockId: crypto.randomUUID(),
        sectionId,
        type,
        content: defaultContent(type),
      },
    ]);
    backToMenu(
      type === "checklist"
        ? "Checklist added — fill the items in the page view."
        : "Added — fill it in from the page view."
    );
  };

  const insertQuickPick = async (pick: ClientQuickPick, sectionId?: string) => {
    if (pick.kind === "section_template") {
      const sid = crypto.randomUUID();
      const ops: any[] = [
        {
          op: "add_section",
          sectionId: sid,
          title: String(pick.payload?.title ?? pick.label),
          type: String(pick.payload?.type ?? "custom"),
        },
        ...(pick.payload?.blocks ?? []).map((b: any) => ({
          op: "add_block",
          blockId: crypto.randomUUID(),
          sectionId: sid,
          type: String(b.type),
          content: b.content ?? {},
        })),
      ];
      await dispatch(ops);
    } else if (sectionId) {
      await dispatch([
        {
          op: "add_block",
          blockId: crypto.randomUUID(),
          sectionId,
          type: pick.kind === "text_value" ? "text" : String(pick.payload?.type ?? "text"),
          content:
            pick.kind === "text_value"
              ? { text: String(pick.payload?.text ?? "") }
              : pick.payload?.content ?? {},
        },
      ]);
    }
    void fetch(`/api/quick-picks/${pick.id}/use`, { method: "POST" });
    backToMenu(`Inserted "${pick.label}". What's next?`);
  };

  const handlePhoto = async (files: FileList | null) => {
    const sectionId = photoTargetRef.current;
    if (!files?.length || !sectionId) return;
    const { assetId, pending } = await uploadImage(files[0], files[0].name);
    await dispatch([
      {
        op: "add_block",
        blockId: crypto.randomUUID(),
        sectionId,
        type: "annotated_image",
        content: { imageAssetId: assetId, caption: "" },
      },
    ]);
    backToMenu(
      pending
        ? "Photo saved on this device (no signal) — it will upload when you're back online. Tap it in the page to annotate the wires."
        : "Photo added. Tap “Annotate wires” on it in the page to mark the connection points. What's next?"
    );
  };

  const handleAnyFile = async (files: FileList | null) => {
    const sectionId = photoTargetRef.current;
    const file = files?.[0];
    if (!file || !sectionId) return;
    const { assetId, pending: queued } = await uploadImage(file, file.name);
    await dispatch([
      {
        op: "add_block",
        blockId: crypto.randomUUID(),
        sectionId,
        type: "file",
        content: { assetId, name: file.name, size: file.size },
      },
    ]);
    backToMenu(
      queued
        ? `"${file.name}" saved on this device (no signal) — it will upload when you're back online.`
        : `Attached "${file.name}". Installers get a download button for it. What's next?`
    );
  };

  const submitText = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    echo(text);
    if (mode.kind === "write_text") {
      await addTextBlock(mode.sectionId, text);
    } else if (mode.kind === "rename_title") {
      await dispatch([{ op: "update_identity", data: { title: text } }]);
      backToMenu(`Renamed to "${text}".`);
    } else {
      // Free text from the menu: treat as note → ask where to put it.
      setMode({ kind: "pick_target_section", then: "text" });
      say("Which section should that go in?");
      setInput(text); // keep it for after section pick
    }
  };

  // --- option rows ---------------------------------------------------------

  let options: Array<{ label: string; onClick: () => void }> = [];
  if (mode.kind === "menu") {
    options = [
      { label: "➕ Add a section", onClick: () => { echo("Add a section"); setMode({ kind: "pick_section_type" }); say("What kind of section?"); } },
      { label: "📷 Add a photo", onClick: () => { echo("Add a photo"); setMode({ kind: "pick_target_section", then: "photo" }); say("Which section gets the photo?"); } },
      { label: "📄 Add a file (software / settings)", onClick: () => { echo("Add a file"); setMode({ kind: "pick_target_section", then: "file" }); say("Which section gets the file? (Usually IGLA Settings or Software)"); } },
      { label: "📝 Add text", onClick: () => { echo("Add text"); setMode({ kind: "pick_target_section", then: "text" }); say("Which section?"); } },
      { label: "☑ Add a checklist", onClick: () => { echo("Add a checklist"); setMode({ kind: "pick_target_section", then: "checklist" }); say("Which section?"); } },
      { label: "⚠ Add a warning", onClick: () => { echo("Add a warning"); setMode({ kind: "pick_target_section", then: "callout" }); say("Which section?"); } },
      { label: "✏ Rename guide", onClick: () => { echo("Rename guide"); setMode({ kind: "rename_title" }); say("What should the new title be?"); } },
      ...quickPicks.slice(0, 3).map((p) => ({
        label: `☆ Insert "${p.label}"`,
        onClick: () => {
          echo(`Insert "${p.label}"`);
          if (p.kind === "section_template") {
            void insertQuickPick(p);
          } else {
            setMode({ kind: "pick_target_section", then: "quick_pick", pickId: p.id });
            say("Which section?");
          }
        },
      })),
    ];
  } else if (mode.kind === "pick_section_type") {
    options = SECTION_TYPES.map((t) => ({
      label: t.label,
      onClick: () => void addSection(t.type, t.label),
    }));
  } else if (mode.kind === "pick_target_section") {
    options = doc.sections.map((s) => ({
      label: s.title,
      onClick: () => {
        echo(s.title);
        if (mode.then === "photo") {
          photoTargetRef.current = s.id;
          fileRef.current?.click();
        } else if (mode.then === "file") {
          photoTargetRef.current = s.id;
          anyFileRef.current?.click();
        } else if (mode.then === "text") {
          if (input.trim()) {
            const text = input.trim();
            setInput("");
            void addTextBlock(s.id, text);
          } else {
            setMode({ kind: "write_text", sectionId: s.id });
            say("Type the text:");
          }
        } else if (mode.then === "checklist" || mode.then === "callout") {
          void addBlockOfType(s.id, mode.then);
        } else if (mode.then === "quick_pick" && mode.pickId) {
          const pick = quickPicks.find((p) => p.id === mode.pickId);
          if (pick) void insertQuickPick(pick, s.id);
        }
      },
    }));
    if (options.length === 0) {
      options = [
        {
          label: "Create a section first",
          onClick: () => {
            setMode({ kind: "pick_section_type" });
            say("No sections yet — what kind of section?");
          },
        },
      ];
    }
  }

  const showTextInput = mode.kind === "write_text" || mode.kind === "rename_title" || mode.kind === "menu";

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-zinc-200 bg-white lg:sticky lg:top-16">
      <div className="flex items-center border-b border-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600">
        Chat editor{" "}
        <span className="ml-1 font-normal text-zinc-400">— same page, different hands</span>
        <a
          href="/quick-picks"
          className="ml-auto text-xs font-normal text-zinc-400 underline hover:text-zinc-600"
          title="Rename, edit or delete saved quick picks"
        >
          ☆ edit quick picks
        </a>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              m.from === "bot"
                ? "bg-zinc-100 text-zinc-800"
                : "ml-auto bg-zinc-900 text-white"
            }`}
          >
            {m.text}
          </div>
        ))}
        {options.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {options.map((o, i) => (
              <button
                key={i}
                onClick={o.onClick}
                className="rounded-full border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
              >
                {o.label}
              </button>
            ))}
            {mode.kind !== "menu" && (
              <button
                onClick={() => {
                  setMode({ kind: "menu" });
                  say("Okay — what else?");
                }}
                className="rounded-full px-3 py-1 text-sm text-zinc-400 hover:bg-zinc-100"
              >
                ← back
              </button>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void handlePhoto(e.target.files)}
      />
      <input
        ref={anyFileRef}
        type="file"
        hidden
        onChange={(e) => void handleAnyFile(e.target.files)}
      />
      {showTextInput && (
        <form
          className="flex gap-2 border-t border-zinc-100 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitText();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode.kind === "rename_title"
                ? "New title…"
                : mode.kind === "write_text"
                ? "Type the text…"
                : "Type anything — I'll ask where to put it"
            }
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none"
          />
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
            Send
          </button>
        </form>
      )}
    </div>
  );
}
