// Shared read-only renderer for a guild document, styled after the Notion
// reference pages: colored full-width section bars, red callout labels over
// photos, dark theme for installer views (light for print/export).
// Image URLs are short-lived signed URLs generated server-side at render time.
import { prisma } from "@/lib/db";
import { signedViewUrl, getObjectDataUrl } from "@/lib/s3";
import type { GuildDoc } from "@/lib/guild-doc";
import { sectionColors } from "@/lib/blocks";
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

type Theme = "dark" | "light";

export default async function GuildView({
  doc,
  theme = "dark",
  inlineImages = false,
}: {
  doc: GuildDoc;
  theme?: Theme;
  /** Embed images as data URLs (for the admin PDF export — no canvas taint). */
  inlineImages?: boolean;
}) {
  // Collect every asset reference, sign URLs and fetch annotations in bulk.
  const imageIds = new Set<string>();
  if (doc.coverImageId) imageIds.add(doc.coverImageId);
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      const c = b.content as Record<string, unknown>;
      if (typeof c?.imageAssetId === "string" && c.imageAssetId) {
        imageIds.add(c.imageAssetId);
      }
      if (typeof c?.assetId === "string" && c.assetId) imageIds.add(c.assetId);
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
      const url = inlineImages
        ? await getObjectDataUrl(a.s3Key)
        : await signedViewUrl(a.s3Key, 300);
      if (url) urlMap.set(a.id, url);
      annoMap.set(a.id, a.annotations as AnnotationRow[]);
    })
  );

  const props = (doc.properties ?? {}) as Record<string, string>;
  const t = themeClasses(theme);

  return (
    <article className={`mx-auto max-w-3xl ${t.text}`}>
      {doc.coverImageId && urlMap.has(doc.coverImageId) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urlMap.get(doc.coverImageId)}
          alt=""
          className="mb-4 max-h-72 w-full rounded-xl object-cover"
        />
      )}
      <h1 className="text-3xl font-bold">{doc.title}</h1>
      <p className={`mt-1 text-sm ${t.muted}`}>
        {doc.make.name} {doc.model.name} {doc.generation.name}
        {doc.trim ? ` · ${doc.trim.name}` : ""} ·{" "}
        {doc.iglaProduct.productLine.name} {doc.iglaProduct.name}
      </p>

      {Object.keys(props).length > 0 && (
        <div className={`mt-4 rounded-xl p-4 ${t.card}`}>
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(props).map(([k, v]) => (
                <tr key={k}>
                  <td className={`w-1/3 py-1 pr-3 font-medium ${t.muted}`}>{k}</td>
                  <td className="py-1">
                    <span className={`rounded px-1.5 py-0.5 ${t.pill}`}>{v}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {doc.sections.map((s) => {
          const colors = sectionColors(s.type);
          return (
            <section key={s.id}>
              <h2
                className={`rounded-t-md px-3 py-1.5 text-base font-semibold ${colors.bar}`}
              >
                {s.title}
              </h2>
              <div
                className={`space-y-4 rounded-b-md border border-t-0 p-4 ${t.sectionBody}`}
              >
                {s.blocks.map((b) => (
                  <BlockView
                    key={b.id}
                    type={b.type}
                    content={b.content as Record<string, unknown>}
                    urlMap={urlMap}
                    annoMap={annoMap}
                    guildId={doc.id}
                    t={t}
                  />
                ))}
                {s.blocks.length === 0 && (
                  <p className={`text-sm ${t.muted}`}>—</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

function themeClasses(theme: Theme) {
  if (theme === "light") {
    return {
      text: "text-zinc-900",
      muted: "text-zinc-500",
      card: "bg-zinc-100",
      pill: "bg-zinc-200",
      sectionBody: "border-zinc-200 bg-white",
      tableHead: "bg-zinc-50",
      tableBorder: "border-zinc-200",
      attachment: "border-zinc-300 bg-zinc-50 hover:bg-zinc-100",
    };
  }
  return {
    text: "text-zinc-100",
    muted: "text-zinc-400",
    card: "bg-zinc-800/80",
    pill: "bg-zinc-700",
    sectionBody: "border-zinc-700 bg-zinc-800/60",
    tableHead: "bg-zinc-800",
    tableBorder: "border-zinc-700",
    attachment: "border-zinc-600 bg-zinc-800 hover:bg-zinc-700",
  };
}

function BlockView({
  type,
  content: c,
  urlMap,
  annoMap,
  guildId,
  t,
}: {
  type: string;
  content: Record<string, unknown>;
  urlMap: Map<string, string>;
  annoMap: Map<string, AnnotationRow[]>;
  guildId: string;
  t: ReturnType<typeof themeClasses>;
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
        <table className={`w-full overflow-hidden rounded-lg border text-sm ${t.tableBorder}`}>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b last:border-0 ${t.tableBorder}`}>
                <td className={`w-1/3 px-3 py-1.5 font-medium ${t.tableHead}`}>{r.key}</td>
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
          {Boolean(c.heading) && (
            <div className="mb-1 rounded-md border-2 border-red-500 bg-zinc-900/90 px-3 py-1.5 text-center text-sm font-bold text-red-400">
              {String(c.heading)}
            </div>
          )}
          <div className="relative inline-block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={String(c.caption ?? "")} className="w-full rounded-lg" data-zoomable />
            {annos.length > 0 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {annos.map((a, i) => (
                  <AnnoShape key={a.id} anno={a as unknown as Anno} index={i} callout />
                ))}
              </svg>
            )}
          </div>
          {annos.some((a) => a.description) && (
            <ol className="mt-2 space-y-1 text-sm">
              {annos
                .filter((a) => a.description)
                .map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: a.color }}
                    />
                    <span>
                      <strong>{a.label}</strong> — {a.description}
                    </span>
                  </li>
                ))}
            </ol>
          )}
          {Boolean(c.caption) && (
            <figcaption className={`mt-1 text-xs ${t.muted}`}>
              {String(c.caption)}
            </figcaption>
          )}
        </figure>
      );
    }
    case "gallery": {
      const items = (c.items as Array<{ imageAssetId: string; caption?: string }>) ?? [];
      const galleryCols: Record<number, string> = {
        1: "grid-cols-1",
        2: "grid-cols-2",
        3: "grid-cols-3",
        4: "grid-cols-4",
      };
      const cols = galleryCols[Number(c.columns) || 2] ?? "grid-cols-2";
      return (
        <div className={`grid items-start gap-3 ${cols}`}>
          {items.map((it, i) => {
            const url = urlMap.get(it.imageAssetId);
            if (!url) return null;
            const annos = annoMap.get(it.imageAssetId) ?? [];
            return (
              <figure key={i}>
                {it.caption && (
                  <figcaption className="mb-1 text-center text-xs font-bold uppercase tracking-wide text-red-500">
                    {it.caption}
                  </figcaption>
                )}
                <div className="relative">
                  {/* natural aspect ratio — not cropped to a square */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={it.caption ?? ""} className="block w-full rounded-lg" data-zoomable />
                  {annos.length > 0 && (
                    <svg className="pointer-events-none absolute inset-0 h-full w-full">
                      {annos.map((a, k) => (
                        <AnnoShape key={a.id} anno={a as unknown as Anno} index={k} callout />
                      ))}
                    </svg>
                  )}
                </div>
              </figure>
            );
          })}
        </div>
      );
    }
    case "connections_table": {
      const rows =
        (c.rows as Array<{
          name: string;
          location: string;
          color: string;
          pin: string;
          note: string;
        }>) ?? [];
      const filled = rows.filter((r) => r.name || r.location || r.color);
      if (filled.length === 0) return null;
      return (
        <div className={`overflow-hidden rounded-lg border ${t.tableBorder}`}>
          <div className={`px-3 py-1.5 text-sm font-semibold ${t.tableHead}`}>
            📊 IGLA Connections
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b text-left text-xs uppercase ${t.tableBorder} ${t.muted}`}>
                <th className="px-3 py-1.5 font-medium"></th>
                <th className="px-3 py-1.5 font-medium">Location</th>
                <th className="px-3 py-1.5 font-medium">Color</th>
                <th className="px-3 py-1.5 font-medium">Pin</th>
                <th className="px-3 py-1.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {filled.map((r, i) => (
                <tr key={i} className={`border-b last:border-0 ${t.tableBorder}`}>
                  <td className="px-3 py-1.5 font-semibold">{r.name}</td>
                  <td className="px-3 py-1.5">{r.location || "–"}</td>
                  <td className="px-3 py-1.5">{r.color || "–"}</td>
                  <td className="px-3 py-1.5">{r.pin || "–"}</td>
                  <td className="px-3 py-1.5">{r.note || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "checklist": {
      const items = (c.items as Array<{ text: string; checked: boolean }>) ?? [];
      return (
        <ul className="space-y-1 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span>{it.checked ? "☑" : "•"}</span>
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "callout": {
      const styles: Record<string, string> = {
        info: "border-blue-400 bg-blue-950/40 text-blue-100",
        warning: "border-amber-400 bg-amber-950/40 text-amber-100",
        danger: "border-red-400 bg-red-950/40 text-red-100",
      };
      const lightStyles: Record<string, string> = {
        info: "border-blue-300 bg-blue-50 text-blue-900",
        warning: "border-amber-300 bg-amber-50 text-amber-900",
        danger: "border-red-300 bg-red-50 text-red-900",
      };
      const icons: Record<string, string> = { info: "ℹ", warning: "⚠", danger: "⛔" };
      const style = String(c.style ?? "warning");
      const isDark = t.text.includes("zinc-100");
      const cls = (isDark ? styles : lightStyles)[style] ?? styles.warning;
      return (
        <div className={`flex gap-2 rounded-lg border p-3 text-sm ${cls}`}>
          <span>{icons[style] ?? "⚠"}</span>
          <p className="whitespace-pre-wrap">{String(c.text ?? "")}</p>
        </div>
      );
    }
    case "code_value":
      return (
        <p className="text-sm">
          {Boolean(c.label) && <span className="font-medium">{String(c.label)}: </span>}
          <code className={`rounded px-2 py-0.5 font-mono ${t.pill}`}>{String(c.value ?? "")}</code>
        </p>
      );
    case "file": {
      const assetId = String(c.assetId ?? "");
      if (!assetId) return null;
      const size = typeof c.size === "number" ? formatSize(c.size) : null;
      return (
        <a
          href={`/api/files/${assetId}/download?guild=${guildId}`}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${t.attachment}`}
        >
          <span className="text-lg">📄</span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {String(c.name ?? "file")}
          </span>
          {size && <span className={`text-xs ${t.muted}`}>{size}</span>}
          <span className={`text-xs ${t.muted}`}>download</span>
        </a>
      );
    }
    case "divider":
      return <hr className={t.tableBorder} />;
    default:
      return null; // unknown block types render as nothing in viewer
  }
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
