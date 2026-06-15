// Manage saved quick picks: rename, change sharing scope, edit text snippets,
// delete stale ones. Admins manage everything; techs manage their own picks
// and shared (org) picks.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

async function editableOrThrow(pickId: string) {
  const user = await requireRole("ADMIN", "TECH");
  const pick = await prisma.quickPick.findUniqueOrThrow({ where: { id: pickId } });
  const canEdit =
    user.role === "ADMIN" || pick.ownerId === user.id || pick.scope === "org";
  if (!canEdit) throw new Error("forbidden");
  return pick;
}

async function updatePick(formData: FormData) {
  "use server";
  const pick = await editableOrThrow(String(formData.get("id")));
  const label = String(formData.get("label") ?? "").trim();
  const scope = String(formData.get("scope") ?? pick.scope);
  const text = formData.get("text");
  const payload =
    pick.kind === "text_value" && text != null
      ? ({ text: String(text) } as Prisma.InputJsonValue)
      : undefined;
  await prisma.quickPick.update({
    where: { id: pick.id },
    data: {
      ...(label ? { label } : {}),
      scope,
      ...(payload !== undefined ? { payload } : {}),
    },
  });
  revalidatePath("/quick-picks");
}

async function deletePick(formData: FormData) {
  "use server";
  const pick = await editableOrThrow(String(formData.get("id")));
  await prisma.quickPick.delete({ where: { id: pick.id } });
  revalidatePath("/quick-picks");
}

const KIND_LABELS: Record<string, string> = {
  section_template: "Whole section",
  block_template: "Single block",
  text_value: "Text snippet",
  settings_preset: "Settings preset",
};

export default async function QuickPicksPage() {
  const user = await requireRole("ADMIN", "TECH");
  const picks = await prisma.quickPick.findMany({
    where:
      user.role === "ADMIN"
        ? {}
        : { OR: [{ ownerId: user.id }, { scope: "org" }] },
    orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    include: { owner: { select: { name: true } }, make: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Quick picks</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Reusable snippets you saved from the editor (the ☆ button on a section)
        or chat. Edit a stale one here — every future insert uses the corrected
        version. Inserting is done from the editor, not here.
      </p>

      <ul className="mt-4 space-y-3">
        {picks.map((p) => {
          const payload = p.payload as {
            text?: string;
            title?: string;
            type?: string;
            blocks?: unknown[];
          };
          return (
            <li key={p.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <form action={updatePick} className="space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-amber-500">☆</span>
                  <input
                    name="label"
                    defaultValue={p.label}
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-sm font-medium"
                  />
                  <select
                    name="scope"
                    defaultValue={p.scope}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs"
                    title="Who can insert this pick"
                  >
                    <option value="personal">Only me</option>
                    <option value="org">Whole team</option>
                  </select>
                </div>
                <p className="text-xs text-zinc-400">
                  {KIND_LABELS[p.kind] ?? p.kind}
                  {p.kind === "section_template" && payload.blocks
                    ? ` · ${payload.blocks.length} block${payload.blocks.length === 1 ? "" : "s"} · "${payload.title ?? ""}"`
                    : ""}
                  {p.make ? ` · ${p.make.name} only` : ""} · used {p.useCount}×
                  {p.owner ? ` · by ${p.owner.name}` : ""}
                </p>
                {p.kind === "text_value" && (
                  <textarea
                    name="text"
                    defaultValue={payload.text ?? ""}
                    rows={2}
                    className="w-full rounded-md border border-zinc-200 px-2 py-1 text-sm"
                  />
                )}
                <div className="flex gap-2">
                  <button className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100">
                    Save changes
                  </button>
                  <button
                    formAction={deletePick}
                    className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </form>
            </li>
          );
        })}
        {picks.length === 0 && (
          <li className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-400">
            No quick picks yet. In the editor, hit the ☆ on any section to save
            it for reuse — it will show up in the chat and the + Add block menu.
          </li>
        )}
      </ul>

      <p className="mt-4 text-xs text-zinc-400">
        To change the <em>content</em> of a saved section/block template: fix
        the section in any guide, hit ☆ to save it under the same name, then
        delete the old one here.
      </p>
    </div>
  );
}
