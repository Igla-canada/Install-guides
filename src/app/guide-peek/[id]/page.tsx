// Guide-only document for the floating peek iframe (no staff chrome).
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { loadGuildDoc } from "@/lib/guild-doc";
import GuildView from "@/components/viewer/guild-view";

export const dynamic = "force-dynamic";

export default async function GuidePeekDocumentPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "INSTALLER") redirect("/my-guides");

  const { id } = await props.params;
  const doc = await loadGuildDoc(id);
  if (!doc) notFound();

  return (
    <div className="min-h-full bg-zinc-900 px-4 py-6 sm:px-6">
      <GuildView doc={doc} theme="dark" />
    </div>
  );
}
