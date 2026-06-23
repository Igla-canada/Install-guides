// Shared read-only renderer for a guild document, styled after the Notion
// reference pages: colored full-width section bars, red callout labels over
// photos, dark theme for installer views (light for print/export).
// Image URLs are short-lived signed URLs generated server-side at render time.
import { prisma } from "@/lib/db";
import { signedViewUrl, getObjectDataUrl } from "@/lib/s3";
import type { GuildDoc } from "@/lib/guild-doc";
import { sectionColors } from "@/lib/blocks";
import { AnnoOverlay, type Anno } from "@/components/images/annotator";
import ImageLightbox from "@/components/viewer/image-lightbox";

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

// The numbered/colored legend shown under an annotated photo. Points show their
// number (matching the on-image marker) so installers can map each one to its
// note; labelled callouts/boxes also list their note here.
function AnnoLegend({ annos }: { annos: AnnotationRow[] }) {
  const shown = (a: AnnotationRow) =>
    Boolean(a.description) || (a.shape === "point" && Boolean(a.label));
  if (!annos.some(shown)) return null;
  return (
    <ol className="mt-2 space-y-1 text-sm">
      {annos.map((a, i) =>
        shown(a) ? (
          <li key={a.id} className="flex gap-2">
            {a.shape === "point" ? (
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: a.color }}
              >
                {i + 1}
              </span>
            ) : (
              <span
                className="mt-1 h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: a.color }}
              />
            )}
            <span>
              {a.label && <strong>{a.label}</strong>}
              {a.label && a.description ? " — " : ""}
              {a.description}
            </span>
          </li>
        ) : null
      )}
    </ol>
  );
}

export default async function GuildView({
  doc,
  theme = "dark",
  inlineImages = false,
  watermark,
}: {
  doc: GuildDoc;
  theme?: Theme;
  /** Embed images as data URLs (for the admin PDF export — no canvas taint). */
  inlineImages?: boolean;
  /** Stamp the zoom lightbox for installer-facing views (leak traceability). */
  watermark?: { label: string; reference: string };
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
  // width / height seed each overlay's viewBox so callouts render at the right
  // scale even before client JS measures the image (server / no-JS / PDF).
  const aspectMap = new Map<string, number>();
  await Promise.all(
    assets.map(async (a) => {
      const url = inlineImages
        ? await getObjectDataUrl(a.s3Key)
        : await signedViewUrl(a.s3Key, 300);
      if (url) urlMap.set(a.id, url);
      annoMap.set(a.id, a.annotations as AnnotationRow[]);
      if (a.width && a.height) aspectMap.set(a.id, a.width / a.height);
    })
  );

  // "IGLA Type" always reflects the guide's REAL product coverage (the identity
  // products the portal matches on), not free-text that can drift and mislead.
  const realProducts = doc.products?.length
    ? doc.products.map((p) => p.iglaProduct.name)
    : [doc.iglaProduct.name];
  const props = {
    ...((doc.properties ?? {}) as Record<string, string>),
    "IGLA Type": realProducts.join(", "),
  };
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

      <PropertiesBox props={props} theme={theme} t={t} />

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
                    aspectMap={aspectMap}
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
      {/* Click any image to zoom (skip during PDF rasterization). */}
      {!inlineImages && <ImageLightbox watermark={watermark} />}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Properties box — Notion-style: ordered rows, an icon per field and coloured
// value tags (multi-values split into individual chips). Years/Version show as
// plain text (they're not select-style values), everything else as a tag.
// ---------------------------------------------------------------------------

const PROP_ORDER = ["Years", "Fuel", "Ignition Type", "IGLA Type", "Status", "Version"];
const PROP_ICONS: Record<string, string> = {
  Years: "📅",
  Fuel: "⛽",
  "Ignition Type": "🔑",
  "IGLA Type": "🛡️",
  Status: "📍",
  Version: "🏷️",
};
const PLAIN_KEYS = new Set(["Years", "Version"]);

type Palette =
  | "amber" | "orange" | "blue" | "purple" | "red" | "green" | "teal" | "pink" | "gray";

const PALETTE_DARK: Record<Palette, string> = {
  amber: "bg-amber-400/15 text-amber-300",
  orange: "bg-orange-400/15 text-orange-300",
  blue: "bg-blue-400/15 text-blue-300",
  purple: "bg-purple-400/20 text-purple-200",
  red: "bg-red-400/15 text-red-300",
  green: "bg-green-400/15 text-green-300",
  teal: "bg-teal-400/15 text-teal-300",
  pink: "bg-pink-400/15 text-pink-300",
  gray: "bg-zinc-500/25 text-zinc-200",
};
const PALETTE_LIGHT: Record<Palette, string> = {
  amber: "bg-amber-100 text-amber-800",
  orange: "bg-orange-100 text-orange-800",
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
  red: "bg-red-100 text-red-800",
  green: "bg-green-100 text-green-800",
  teal: "bg-teal-100 text-teal-800",
  pink: "bg-pink-100 text-pink-800",
  gray: "bg-zinc-200 text-zinc-700",
};
const HASH_PALETTE: Palette[] = ["blue", "purple", "pink", "teal", "amber", "orange", "green"];
const KNOWN_VALUE: Record<string, Palette> = {
  diesel: "amber", gas: "blue", gasoline: "blue", petrol: "blue",
  hybrid: "green", electric: "teal", ev: "teal",
  "push start": "purple", "push-start": "purple", "push button start": "purple",
  key: "blue", "turn key": "blue", "key start": "blue",
  stable: "green", beta: "amber", testing: "amber", wip: "orange", draft: "gray",
  alarm: "red", "231": "purple", "251": "pink", "key access": "blue",
};

function paletteFor(value: string): Palette {
  const v = value.trim().toLowerCase();
  if (KNOWN_VALUE[v]) return KNOWN_VALUE[v];
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0;
  return HASH_PALETTE[h % HASH_PALETTE.length];
}

function PropertiesBox({
  props,
  theme,
  t,
}: {
  props: Record<string, string>;
  theme: Theme;
  t: ReturnType<typeof themeClasses>;
}) {
  const entries = Object.entries(props).filter(([k]) => !k.startsWith("_") && props[k]);
  if (entries.length === 0) return null;
  entries.sort((a, b) => {
    const ia = PROP_ORDER.indexOf(a[0]);
    const ib = PROP_ORDER.indexOf(b[0]);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a[0].localeCompare(b[0]);
  });
  const palette = theme === "dark" ? PALETTE_DARK : PALETTE_LIGHT;

  return (
    <dl className={`mt-4 space-y-1.5 rounded-xl p-4 text-sm ${t.card}`}>
      {entries.map(([k, v]) => {
        const isPlain = PLAIN_KEYS.has(k);
        const tags = String(v)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return (
          <div key={k} className="flex items-start gap-3">
            <dt className={`flex w-32 shrink-0 items-center gap-2 ${t.muted}`}>
              <span className="text-base leading-none">{PROP_ICONS[k] ?? "•"}</span>
              <span className="truncate">{k}</span>
            </dt>
            <dd className="flex flex-1 flex-wrap items-center gap-1.5">
              {isPlain ? (
                <span>{v}</span>
              ) : (
                tags.map((tag, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${palette[paletteFor(tag)]}`}
                  >
                    {k === "Status" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                    )}
                    {tag}
                  </span>
                ))
              )}
            </dd>
          </div>
        );
      })}
    </dl>
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
  aspectMap,
  guildId,
  t,
}: {
  type: string;
  content: Record<string, unknown>;
  urlMap: Map<string, string>;
  annoMap: Map<string, AnnotationRow[]>;
  aspectMap: Map<string, number>;
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
              <AnnoOverlay
                annos={annos as unknown as Anno[]}
                aspect={aspectMap.get(id)}
              />
            )}
          </div>
          <AnnoLegend annos={annos} />
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
                    <AnnoOverlay
                      annos={annos as unknown as Anno[]}
                      aspect={aspectMap.get(it.imageAssetId)}
                    />
                  )}
                </div>
                <AnnoLegend annos={annos} />
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
          {/* Scrolls sideways on narrow phones so Pin/Note are never cut off */}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
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
    case "file_text": {
      const text = String(c.text ?? "");
      // One description + one or more files. New blocks store `files: [...]`;
      // older ones used flat assetId/name/size — render either.
      const files: Array<{ assetId: string; name?: string; size?: number }> =
        Array.isArray(c.files)
          ? c.files.filter((f: { assetId?: string }) => f && f.assetId)
          : c.assetId
          ? [{ assetId: String(c.assetId), name: c.name, size: c.size }]
          : [];
      return (
        <div className={`rounded-lg border p-3 ${t.tableBorder} ${t.card}`}>
          {text && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
          )}
          {files.length > 0 && (
            <div className={`${text ? "mt-2 " : ""}space-y-2`}>
              {files.map((f, i) => {
                const size = typeof f.size === "number" ? formatSize(f.size) : null;
                return (
                  <a
                    key={`${f.assetId}-${i}`}
                    href={`/api/files/${String(f.assetId)}/download?guild=${guildId}`}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${t.attachment}`}
                  >
                    <span className="text-lg">📄</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {String(f.name ?? "file")}
                    </span>
                    {size && <span className={`text-xs ${t.muted}`}>{size}</span>}
                    <span className={`text-xs ${t.muted}`}>download</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
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
