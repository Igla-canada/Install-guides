// Retrieval over guide content — the "R" in the MCP server's RAG.
//
// GuideSearchDoc is a denormalised mirror of guide content, rebuilt from the
// guide exactly like VehicleCompatibility is (AGENTS.md #1: the guide stays the
// one source of truth). Nothing here ever writes to a Guild.
//
// Retrieval is Postgres full-text (weighted tsvector + ts_rank), with an ILIKE
// fallback for the queries FTS is bad at — part numbers, wire colours, a bare
// model name someone typed as one token. No embeddings, so there is no API key,
// no per-query cost and nothing to re-embed when a guide is edited.
import { prisma } from "./db";
import { annotationsToText, blockToText } from "./guide-text";
import { yearsLabel } from "./vehicle-compatibility";

/** Cap on returned snippets, so one broad query can't flood an agent's context. */
export const SEARCH_LIMIT_DEFAULT = 8;
export const SEARCH_LIMIT_MAX = 25;
/** Body text kept per section. Long enough to answer, short enough to read. */
const BODY_CHARS = 6000;

export type GuideSearchHit = {
  /** Opaque id an agent passes to `fetch` / get_guide. */
  id: string;
  guideId: string;
  sectionId: string | null;
  title: string;
  sectionTitle: string;
  vehicle: string;
  product: string;
  region: string;
  years: string;
  url: string;
  snippet: string;
  score: number;
};

function vehicleLabel(r: {
  make: string;
  model: string;
  years: string;
  trim: string | null;
}): string {
  return [r.years, r.make, r.model, r.trim].filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

/**
 * Rebuild the search rows for ONE guide. Delete-then-insert rather than diffing:
 * a guide is a handful of sections, and a rebuild can't leave a deleted section
 * behind (which a diff eventually would).
 */
export async function syncGuideSearchDocs(guildId: string): Promise<number> {
  const g = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      title: true,
      status: true,
      make: { select: { name: true } },
      model: { select: { name: true } },
      trim: { select: { name: true } },
      region: { select: { name: true } },
      iglaProduct: { select: { name: true } },
      products: { select: { iglaProduct: { select: { name: true } } } },
      generation: { select: { name: true, yearStart: true, yearEnd: true } },
      altMakes: { select: { make: { select: { name: true } } } },
      altModelAliases: { select: { name: true } },
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          order: true,
          blocks: { orderBy: { order: "asc" }, select: { type: true, content: true } },
        },
      },
    },
  });

  await prisma.guideSearchDoc.deleteMany({ where: { guildId } });
  if (!g) return 0;

  // Photo callouts often carry the only words on an installation-point section
  // ("CAN-H here"), so they are indexed with the section they appear in.
  const annotationsBySection = await loadSectionAnnotationText(
    g.sections.map((s) => s.id),
  );

  const identity = {
    guideTitle: g.title.trim(),
    make: g.make.name,
    model: g.model.name,
    generation: g.generation.name,
    years: yearsLabel(g.generation.yearStart, g.generation.yearEnd),
    trim: g.trim?.name ?? null,
    product: [g.iglaProduct.name, ...g.products.map((p) => p.iglaProduct.name)]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(" · "),
    region: g.region.name,
    status: g.status,
    aliases: [
      ...g.altMakes.map((m) => m.make.name),
      ...g.altModelAliases.map((a) => a.name),
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" · "),
  };

  type IndexRow = typeof identity & {
    guildId: string;
    sectionId: string | null;
    sectionOrder: number;
    sectionTitle: string;
    body: string;
  };

  const rows: IndexRow[] = g.sections.map((s) => {
    const blockText = s.blocks
      .map((b) => blockToText(b.type, b.content))
      .filter(Boolean)
      .join("\n");
    const body = [blockText, annotationsBySection.get(s.id)]
      .filter(Boolean)
      .join("\n")
      .slice(0, BODY_CHARS);
    return {
      guildId,
      sectionId: s.id,
      sectionOrder: s.order,
      sectionTitle: s.title.trim(),
      body,
      ...identity,
    };
  });

  // A guide with no sections still deserves to be findable by its identity.
  if (!rows.length) {
    rows.push({
      guildId,
      sectionId: null,
      sectionOrder: 0,
      sectionTitle: "",
      body: "",
      ...identity,
    });
  }

  await prisma.guideSearchDoc.createMany({ data: rows });
  return rows.length;
}

async function loadSectionAnnotationText(
  sectionIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!sectionIds.length) return out;

  const blocks = await prisma.block.findMany({
    where: { sectionId: { in: sectionIds } },
    select: { sectionId: true, content: true },
  });

  // Image ids live inside the JSONB, in a couple of shapes.
  const idsBySection = new Map<string, Set<string>>();
  for (const b of blocks) {
    const c = (b.content ?? {}) as Record<string, unknown>;
    const ids: string[] = [];
    if (typeof c.imageAssetId === "string") ids.push(c.imageAssetId);
    if (Array.isArray(c.items)) {
      for (const it of c.items) {
        const id = (it as Record<string, unknown>)?.imageAssetId;
        if (typeof id === "string") ids.push(id);
      }
    }
    if (!ids.length) continue;
    const set = idsBySection.get(b.sectionId) ?? new Set<string>();
    for (const id of ids) if (id) set.add(id);
    idsBySection.set(b.sectionId, set);
  }

  const allIds = [...new Set([...idsBySection.values()].flatMap((s) => [...s]))];
  if (!allIds.length) return out;

  const annotations = await prisma.annotation.findMany({
    where: { imageAssetId: { in: allIds } },
    orderBy: { order: "asc" },
    select: { imageAssetId: true, label: true, description: true },
  });
  const byImage = new Map<string, Array<{ label: string; description: string | null }>>();
  for (const a of annotations) {
    byImage.set(a.imageAssetId, [...(byImage.get(a.imageAssetId) ?? []), a]);
  }

  for (const [sectionId, ids] of idsBySection) {
    const text = annotationsToText([...ids].flatMap((id) => byImage.get(id) ?? []));
    if (text) out.set(sectionId, text);
  }
  return out;
}

/** Rebuild every guide's rows. Used by scripts/reindex-guide-search.ts. */
export async function reindexAllGuides(
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<{ guides: number; rows: number }> {
  const guides = await prisma.guild.findMany({ select: { id: true, title: true } });
  let rows = 0;
  for (const [i, g] of guides.entries()) {
    rows += await syncGuideSearchDocs(g.id);
    onProgress?.(i + 1, guides.length, g.title);
  }
  return { guides: guides.length, rows };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export type GuideSearchFilters = {
  make?: string;
  model?: string;
  year?: number;
  product?: string;
  /** Default true. Only ever false for staff tooling, never for the MCP server. */
  publishedOnly?: boolean;
  limit?: number;
};

type RawHit = {
  id: string;
  guildId: string;
  sectionId: string | null;
  guideTitle: string;
  sectionTitle: string;
  make: string;
  model: string;
  years: string;
  trim: string | null;
  product: string;
  region: string;
  body: string;
  score: number;
};

/**
 * Rank guide sections against a natural-language query.
 *
 * `websearch_to_tsquery` is deliberate: it accepts what a person (or an agent
 * relaying one) actually types — quoted phrases, `or`, a leading `-` — instead
 * of erroring on the punctuation that `to_tsquery` rejects.
 */
export async function searchGuides(
  query: string,
  filters: GuideSearchFilters = {},
): Promise<GuideSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(Math.max(filters.limit ?? SEARCH_LIMIT_DEFAULT, 1), SEARCH_LIMIT_MAX);
  const publishedOnly = filters.publishedOnly !== false;

  // The live Guild row decides visibility, never the status snapshot on the
  // mirror — a stale snapshot must not be able to surface an unpublished guide.
  const visibleGuildIds = await visibleGuideIds(publishedOnly);
  if (visibleGuildIds !== null && visibleGuildIds.length === 0) return [];

  const like = (v?: string) => (v?.trim() ? `%${v.trim()}%` : null);
  const makeLike = like(filters.make);
  const modelLike = like(filters.model);
  const productLike = like(filters.product);

  const rows = await prisma.$queryRaw<RawHit[]>`
    SELECT d."id", d."guildId", d."sectionId", d."guideTitle", d."sectionTitle",
           d."make", d."model", d."years", d."trim", d."product", d."region", d."body",
           ts_rank(d."search", websearch_to_tsquery('english', ${q}))::float8 AS score
    FROM "GuideSearchDoc" d
    WHERE d."search" @@ websearch_to_tsquery('english', ${q})
      AND (${visibleGuildIds}::text[] IS NULL OR d."guildId" = ANY(${visibleGuildIds}::text[]))
      AND (${makeLike}::text IS NULL OR d."make" ILIKE ${makeLike} OR d."aliases" ILIKE ${makeLike})
      AND (${modelLike}::text IS NULL OR d."model" ILIKE ${modelLike} OR d."aliases" ILIKE ${modelLike})
      AND (${productLike}::text IS NULL OR d."product" ILIKE ${productLike})
    ORDER BY score DESC, d."guideTitle" ASC, d."sectionOrder" ASC
    LIMIT ${limit}
  `;

  // `websearch_to_tsquery` ANDs every term, so a whole question ("where does
  // the CAN bus connect on a 2024 Ram 1500") narrows to almost nothing — bad
  // for RAG, where recall matters more than precision because the agent reads
  // the results and discards what doesn't fit. When the strict pass is thin,
  // widen in two steps: the same terms OR'd and re-ranked, then a literal
  // substring scan for what full-text tokenisation handles badly (part numbers,
  // wire colours, a bare model name). Both keep the AND hits on top.
  let hits = rows;
  const thin = () => hits.length < Math.min(3, limit);

  if (thin()) {
    const anyTerms = orTsQuery(q);
    if (anyTerms) {
      hits = dedupeById([
        ...hits,
        ...(await rankedSearch(anyTerms, {
          visibleGuildIds,
          makeLike,
          modelLike,
          productLike,
          limit,
        })),
      ]);
    }
  }
  if (thin()) {
    hits = dedupeById([
      ...hits,
      ...(await substringSearch(q, {
        visibleGuildIds,
        makeLike,
        modelLike,
        productLike,
        limit,
      })),
    ]);
  }
  hits = hits.slice(0, limit);

  return hits.map((r) => ({
    id: r.id,
    guideId: r.guildId,
    sectionId: r.sectionId,
    title: r.guideTitle,
    sectionTitle: r.sectionTitle,
    vehicle: vehicleLabel(r),
    product: r.product,
    region: r.region,
    years: r.years,
    url: guideUrl(r.guildId),
    snippet: snippetAround(r.body, q),
    score: Number(r.score ?? 0),
  }));
}

/**
 * The query's words as an OR'd tsquery, e.g. "can bus ram" → `can | bus | ram`.
 *
 * Built from `[a-z0-9]` tokens only, so nothing the user typed can reach
 * `to_tsquery` as operator syntax and blow up the statement. Returns null when
 * there is nothing worth searching for.
 */
function orTsQuery(q: string): string | null {
  const stop = new Set([
    "the", "and", "for", "with", "does", "where", "what", "how", "was", "are",
    "you", "your", "can", "not", "this", "that", "when", "which", "from",
  ]);
  const terms = q
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2 && !stop.has(t));
  // "can bus" is the whole subject in this domain — keep a stop word if
  // dropping them would leave nothing to search for.
  const fallback = q
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2);
  const use = terms.length ? terms : fallback;
  return use.length ? [...new Set(use)].join(" | ") : null;
}

/** Same shape as the main query, driven by an already-safe tsquery string. */
async function rankedSearch(
  tsquery: string,
  opts: {
    visibleGuildIds: string[] | null;
    makeLike: string | null;
    modelLike: string | null;
    productLike: string | null;
    limit: number;
  },
): Promise<RawHit[]> {
  return prisma.$queryRaw<RawHit[]>`
    SELECT d."id", d."guildId", d."sectionId", d."guideTitle", d."sectionTitle",
           d."make", d."model", d."years", d."trim", d."product", d."region", d."body",
           ts_rank(d."search", to_tsquery('english', ${tsquery}))::float8 AS score
    FROM "GuideSearchDoc" d
    WHERE d."search" @@ to_tsquery('english', ${tsquery})
      AND (${opts.visibleGuildIds}::text[] IS NULL OR d."guildId" = ANY(${opts.visibleGuildIds}::text[]))
      AND (${opts.makeLike}::text IS NULL OR d."make" ILIKE ${opts.makeLike} OR d."aliases" ILIKE ${opts.makeLike})
      AND (${opts.modelLike}::text IS NULL OR d."model" ILIKE ${opts.modelLike} OR d."aliases" ILIKE ${opts.modelLike})
      AND (${opts.productLike}::text IS NULL OR d."product" ILIKE ${opts.productLike})
    ORDER BY score DESC, d."guideTitle" ASC, d."sectionOrder" ASC
    LIMIT ${opts.limit}
  `;
}

async function substringSearch(
  q: string,
  opts: {
    visibleGuildIds: string[] | null;
    makeLike: string | null;
    modelLike: string | null;
    productLike: string | null;
    limit: number;
  },
): Promise<RawHit[]> {
  const needle = `%${q}%`;
  return prisma.$queryRaw<RawHit[]>`
    SELECT d."id", d."guildId", d."sectionId", d."guideTitle", d."sectionTitle",
           d."make", d."model", d."years", d."trim", d."product", d."region", d."body",
           0.0001::float8 AS score
    FROM "GuideSearchDoc" d
    WHERE (d."body" ILIKE ${needle} OR d."sectionTitle" ILIKE ${needle}
           OR d."guideTitle" ILIKE ${needle} OR d."model" ILIKE ${needle}
           OR d."aliases" ILIKE ${needle})
      AND (${opts.visibleGuildIds}::text[] IS NULL OR d."guildId" = ANY(${opts.visibleGuildIds}::text[]))
      AND (${opts.makeLike}::text IS NULL OR d."make" ILIKE ${opts.makeLike} OR d."aliases" ILIKE ${opts.makeLike})
      AND (${opts.modelLike}::text IS NULL OR d."model" ILIKE ${opts.modelLike} OR d."aliases" ILIKE ${opts.modelLike})
      AND (${opts.productLike}::text IS NULL OR d."product" ILIKE ${opts.productLike})
    ORDER BY d."guideTitle" ASC, d."sectionOrder" ASC
    LIMIT ${opts.limit}
  `;
}

function dedupeById(rows: RawHit[]): RawHit[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/**
 * Guide ids the caller may see. Returns null for "no restriction" (staff).
 * Mirrors the compatibility rule: PUBLISHED and not hidden from listings.
 */
async function visibleGuideIds(publishedOnly: boolean): Promise<string[] | null> {
  if (!publishedOnly) return null;
  const guides = await prisma.guild.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true },
  });
  return guides.map((g) => g.id);
}

/** ~400 characters centred on the first query word that appears in the body. */
export function snippetAround(body: string, query: string, radius = 200): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2);
  const lower = text.toLowerCase();
  let at = -1;
  for (const w of words) {
    at = lower.indexOf(w);
    if (at >= 0) break;
  }
  if (at < 0) return text.slice(0, radius * 2) + (text.length > radius * 2 ? "…" : "");
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

/**
 * Absolute URL for a guide. Absolute matters here: an agent cites these back to
 * a user, and a bare "/guides/<id>" is not something anyone can open.
 *
 * APP_BASE_URL is what the rest of this app uses (grants, password reset, the
 * issue API). VERCEL_URL is the deploy-time fallback so a preview deployment
 * still returns links that work.
 */
export function guideUrl(guildId: string): string {
  const configured = process.env.APP_BASE_URL?.trim();
  const vercel = process.env.VERCEL_URL?.trim();
  const base = (
    configured || (vercel ? `https://${vercel}` : "http://localhost:3000")
  ).replace(/\/$/, "");
  return `${base}/guides/${guildId}`;
}

// ---------------------------------------------------------------------------
// Whole-document read (the `fetch` half of retrieval)
// ---------------------------------------------------------------------------

export type GuideDocument = {
  id: string;
  title: string;
  vehicle: string;
  make: string;
  model: string;
  generation: string;
  years: string;
  trim: string | null;
  product: string;
  region: string;
  status: string;
  aliases: string[];
  url: string;
  sections: Array<{ id: string; title: string; text: string }>;
};

/**
 * A whole guide as text. Accepts a guide id OR a search-hit id, because an agent
 * will hand back whichever it was given.
 */
export async function getGuideDocument(
  idOrHitId: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<GuideDocument | null> {
  const publishedOnly = opts.publishedOnly !== false;

  let guildId = idOrHitId;
  const hit = await prisma.guideSearchDoc.findUnique({
    where: { id: idOrHitId },
    select: { guildId: true },
  });
  if (hit) guildId = hit.guildId;

  const g = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      title: true,
      status: true,
      make: { select: { name: true } },
      model: { select: { name: true } },
      trim: { select: { name: true } },
      region: { select: { name: true } },
      iglaProduct: { select: { name: true } },
      products: { select: { iglaProduct: { select: { name: true } } } },
      generation: { select: { name: true, yearStart: true, yearEnd: true } },
      altMakes: { select: { make: { select: { name: true } } } },
      altModelAliases: { select: { name: true } },
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          blocks: { orderBy: { order: "asc" }, select: { type: true, content: true } },
        },
      },
    },
  });
  if (!g) return null;
  if (publishedOnly && g.status !== "PUBLISHED") return null;

  const years = yearsLabel(g.generation.yearStart, g.generation.yearEnd);
  const annotations = await loadSectionAnnotationText(g.sections.map((s) => s.id));

  return {
    id: g.id,
    title: g.title,
    vehicle: [years, g.make.name, g.model.name, g.trim?.name].filter(Boolean).join(" "),
    make: g.make.name,
    model: g.model.name,
    generation: g.generation.name,
    years,
    trim: g.trim?.name ?? null,
    product: [g.iglaProduct.name, ...g.products.map((p) => p.iglaProduct.name)]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(" · "),
    region: g.region.name,
    status: g.status,
    aliases: [
      ...g.altMakes.map((m) => m.make.name),
      ...g.altModelAliases.map((a) => a.name),
    ]
      .map((s) => s.trim())
      .filter(Boolean),
    url: guideUrl(g.id),
    sections: g.sections.map((s) => ({
      id: s.id,
      title: s.title,
      text: [
        s.blocks.map((b) => blockToText(b.type, b.content)).filter(Boolean).join("\n"),
        annotations.get(s.id),
      ]
        .filter(Boolean)
        .join("\n"),
    })),
  };
}
