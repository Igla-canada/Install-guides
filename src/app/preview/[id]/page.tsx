// Staff-only "what the installer will see" preview — the EXACT same renderer
// and dark theme as the real installer view, embedded in the editor's Preview
// tab. Drafts render too (so you can check before publishing).
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadGuildDoc } from "@/lib/guild-doc";
import GuildView from "@/components/viewer/guild-view";

export const dynamic = "force-dynamic";

export default async function PreviewGuildPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN", "TECH");
  const { id } = await props.params;
  const doc = await loadGuildDoc(id);
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-zinc-900 px-4 py-6">
      <div className="mx-auto mb-4 max-w-3xl rounded-md bg-zinc-800 px-3 py-1.5 text-center text-xs text-zinc-400">
        Preview — exactly what an installer sees (their copy also carries a
        personal watermark)
      </div>
      <GuildView doc={doc} theme="dark" />
    </main>
  );
}
