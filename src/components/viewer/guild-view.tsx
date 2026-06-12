// Shared read-only renderer for a guild document. Used by the installer link
// view, installer-account view, and the admin print/PDF view. Image URLs are
// short-lived signed URLs generated server-side at render time.
import { prisma } from "@/lib/db";
import { signedViewUrl } from "@/lib/s3";
import type { GuildDoc } from "@/lib/guild-doc";
import { sectionAccent } from "@/lib/blocks";
import { AnnoShape, type Anno } from "@/components/images/annotator";

type AnnotationRow = {
  id: string;
  imageAssetId: string;
  shape: string;
  coords: unknown;
  label: string;
  description: string | null;
  color: string;
  order: number;
};

export default async function GuildView({ doc }: { doc: GuildDoc }) {
  // Collect every image reference, sign URLs and fetch annotations in bulk.
  const imageIds = new Set<string>();
  if (doc.coverImageId) imageIds.add(doc.coverImageId);
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      const c = b.content as Record<string, unknown>;
      if (typeof c?.imageAssetId === "string" && c.imageAssetId) {
        imageIds.add(c.imageAssetId);
      }
      if (Array.isArray(c?.items)) {
        for (const it of c.items as Array<{ imageAssetId?: string }>) {
          if (it?.imageAssetId) imageIds.add(it.imageAssetId);
        }
      }
    }
  }
  const assets = await prisma.imageAsset.findMany({
    where: { id: { in: [...imageIds] } },
    include: { annotations: { orderBy: { order: "asc" } } },
  });
  const urlMap = new Map<string, string>();
  const annoMap = new Map<string, AnnotationRow[]>();
  await Promise.all(
    assets.map(async (a) => {
      urlMap.set(a.id, await signedViewUrl(a.s3Key, 300));
      annoMap.set(a.id, a.annotations as AnnotationRow[]);
    })
  );

  const props = (doc.properties ?? {}) as Record<string, string>;

  return (
    <article className="mx-auto max-w-3xl">
      {doc.coverImageId && urlMap.has(doc.coverImageId) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urlMap.get(doc.coverImageId)}
          alt=""
          className="mb-4 max-h-64 w-full rounded-xl object-cover"
        />
      )}
      <h1 className="text-2xl font-bold">{doc.title}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {doc.make.name} {doc.model.name} {doc.generation.name}
        {doc.trim ? ` · ${doc.trim.name}` : ""} ·{" "}
        {doc.iglaProduct.productLine.name} {doc.iglaProduct.name}
      </p>

      {Object.keys(props).length > 0 && (
        <div className="mt-4 rounded-xl bg-zinc-100 p-4">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(props).map(([k, v]) => (
                <tr key={k}>
                  <td className="w-1/3 py-0.5 pr-3 font-medium text-zinc-500">{k}</td>
                  <td className="py-0.5">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {doc.sections.map((s) => (
          <section
            key={s.id}
            className={`rounded-xl border border-zinc-200 border-l-4 bg-white p-5 ${sectionAccent(s.type)}`}
          >
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <div className="mt-3 space-y-4">
              {s.blocks.map((b) => (
                <BlockView
                  key={b.id}
                  type={b.type}
                  content={b.content as Record<string, unknown>}
                  urlMap={urlMap}
                  annoMap={annoMap}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function BlockView({
  type,
  content: c,
  urlMap,
  annoMap,
}: {
  type: string;
  content: Record<string, unknown>;
  urlMap: Map<string, string>;
  annoMap: Map<string, AnnotationRow[]>;
}) {
  switch (type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {String(c.text ?? "")}
        </p>
      );
    case "key_value_table": {
      const rows = (c.rows as Array<{ key: string; value: string }>) ?? [];
      return (
        <table className="w-full overflow-hidden rounded-lg border border-zinc-200 text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-zinc-100 last:border-0">
                <td className="w-1/3 bg-zinc-50 px-3 py-1.5 font-medium">{r.key}</td>
                <td className="px-3 py-1.5">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "image":
    case "annotated_image": {
      const id = String(c.imageAssetId ?? "");
      const url = urlMap.get(id);
      if (!url) return null;
      const annos = type === "annotated_image" ? annoMap.get(id) ?? [] : [];
      return (
        <figure>
          <div className="relative inline-block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={String(c.caption ?? "")} className="w-full rounded-lg" data-zoomable />
            {annos.length > 0 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {annos.map((a, i) => (
                  <AnnoShape key={a.id} anno={a as unknown as Anno} index={i} />
                ))}
              </svg>
            )}
          </div>
          {annos.length > 0 && (
            <ol className="mt-2 space-y-1 text-sm">
              {annos.map((a, i) => (
                <li key={a.id} className="flex gap-2">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {i + 1}
                  </span>
                  <span>
                    <strong>{a.label}</strong>
                    {a.description ? ` — ${a.description}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {Boolean(c.caption) && (
            <figcaption className="mt-1 text-xs text-zinc-500">
              {String(c.caption)}
            </figcaption>
          )}
        </figure>
      );
    }
    case "gallery": {
      const items = (c.items as Array<{ imageAssetId: string; caption?: string }>) ?? [];
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((it, i) => {
            const url = urlMap.get(it.imageAssetId);
            if (!url) return null;
            return (
              <figure key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={it.caption ?? ""} className="h-32 w-full rounded-lg object-cover" data-zoomable />
                {it.caption && (
                  <figcaption className="mt-0.5 text-xs text-zinc-500">{it.caption}</figcaption>
                )}
              </figure>
            );
          })}
        </div>
      );
    }
    case "checklist": {
      const items = (c.items as Array<{ text: string; checked: boolean }>) ?? [];
      return (
        <ul className="space-y-1 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span>{it.checked ? "☑" : "☐"}</span>
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "callout": {
      const styles: Record<string, string> = {
        info: "bg-blue-50 border-blue-300",
        warning: "bg-amber-50 border-amber-300",
        danger: "bg-red-50 border-red-300",
      };
      const icons: Record<string, string> = { info: "ℹ", warning: "⚠", danger: "⛔" };
      const style = String(c.style ?? "warning");
      return (
        <div className={`flex gap-2 rounded-lg border p-3 text-sm ${styles[style] ?? styles.warning}`}>
          <span>{icons[style] ?? "⚠"}</span>
          <p className="whitespace-pre-wrap">{String(c.text ?? "")}</p>
        </div>
      );
    }
    case "code_value":
      return (
        <p className="text-sm">
          {Boolean(c.label) && <span className="font-medium">{String(c.label)}: </span>}
          <code className="rounded bg-zinc-100 px-2 py-0.5 font-mono">{String(c.value ?? "")}</code>
        </p>
      );
    case "divider":
      return <hr className="border-zinc-200" />;
    default:
      return null; // unknown block types render as nothing in viewer
  }
}
