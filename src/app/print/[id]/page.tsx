// Admin/tech-only print & archival view (browser print â†’ PDF). This is the
// INTERNAL export path; installer-facing routes never expose it. Each export
// is still stamped with who exported it and logged.
import { notFound } from "next/navigation";
import { requireRole, requestMeta } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { loadGuildDoc } from "@/lib/guild-doc";
import GuildView from "@/components/viewer/guild-view";

export const dynamic = "force-dynamic";

export default async function PrintGuildPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("ADMIN", "TECH");
  const { id } = await props.params;
  const doc = await loadGuildDoc(id);
  if (!doc) notFound();

  const meta = await requestMeta();
  await logEvent({
    actor: { userId: user.id },
    guildId: id,
    action: "pdf_download",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { via: "print_view" },
  });

  const stamp = `Internal export Â· ${user.name} Â· ${new Date().toISOString()}`;
  return (
    <main className="bg-white p-8 print:p-0">
      <p className="mb-4 text-xs text-zinc-400 print:fixed print:bottom-2 print:left-2">
        {stamp}
      </p>
      <GuildView doc={doc} theme="light" />
    </main>
  );
}
