// Files Manager — a reusable library of large files (firmware, settings) that
// are uploaded ONCE and picked into many guides, instead of re-uploading the
// same 40–100 MB file over and over. Admin-only management; techs pick existing
// files from the editor.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import FilesManager from "@/components/files/files-manager";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  await requireRole("ADMIN");
  const files = await prisma.imageAsset.findMany({
    where: { libraryName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, libraryName: true, size: true, mime: true, createdAt: true },
  });
  const initial = files.map((f) => ({
    id: f.id,
    name: f.libraryName ?? "file",
    size: f.size,
    mime: f.mime,
    createdAt: f.createdAt.toISOString(),
  }));
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold">Files manager</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Upload large files (firmware, settings — up to 100&nbsp;MB) once here, then
        pick them in any guide’s “file + text” block via <em>Use existing file</em>.
        Download one file, selected files (ZIP or one-by-one), or the whole library
        as a ZIP.
      </p>
      <FilesManager initial={initial} />
    </div>
  );
}
