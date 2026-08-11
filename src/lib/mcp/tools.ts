// The tools this MCP server exposes to a support agent.
//
// Two families, on purpose:
//
//  • `search` / `fetch` — the contract OpenAI's connectors expect (search returns
//    {id,title,url} results; fetch returns the full text for an id). Having them
//    named and shaped exactly this way is what lets ChatGPT use this server as a
//    knowledge source without any glue.
//
//  • `search_guides` / `get_guide` / `check_compatibility` / `list_vehicles` —
//    richer, domain-aware versions for agents that can use arbitrary tools. They
//    take filters (make/model/year) that a support agent almost always knows.
//
// Everything is READ-ONLY and PUBLISHED-only. There is no tool here that writes,
// and none that can reach a draft or archived guide.
import { prisma } from "@/lib/db";
import {
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  getGuideDocument,
  guideUrl,
  searchGuides,
} from "@/lib/guide-search";
import {
  ALARM_MORE_BUTTONS_NOTE,
  buildCompatibilityWhere,
  excludeHiddenCompatibilityRows,
  loadGuideIdsForAltMake,
  loadGuideModelAliases,
  loadLiveGuideCompatInfo,
  rowMatchesModel,
  toPublicCompatibilityItem,
} from "@/lib/vehicle-compatibility";

export type JsonSchema = Record<string, unknown>;

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || undefined;
};
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

// ---------------------------------------------------------------------------

async function runSearch(args: Record<string, unknown>) {
  const query = str(args.query) ?? "";
  const hits = await searchGuides(query, {
    make: str(args.make),
    model: str(args.model),
    year: num(args.year),
    product: str(args.product),
    limit: num(args.limit),
  });
  return hits.map((h) => ({
    id: h.id,
    title: [h.title, h.sectionTitle].filter(Boolean).join(" — "),
    url: h.url,
    vehicle: h.vehicle,
    product: h.product,
    snippet: h.snippet,
  }));
}

async function runFetch(id: string) {
  const doc = await getGuideDocument(id);
  if (!doc) {
    return {
      id,
      title: "Not found",
      text: "No published guide matches that id.",
      url: "",
      metadata: {},
    };
  }
  const text = [
    `# ${doc.title}`,
    `Vehicle: ${doc.vehicle}`,
    `Igla product: ${doc.product}`,
    `Region: ${doc.region}`,
    doc.aliases.length ? `Also known as: ${doc.aliases.join(", ")}` : "",
    "",
    ...doc.sections.map((s) => `## ${s.title}\n${s.text}`.trim()),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    id: doc.id,
    title: doc.title,
    text,
    url: doc.url,
    metadata: {
      make: doc.make,
      model: doc.model,
      generation: doc.generation,
      years: doc.years,
      trim: doc.trim,
      product: doc.product,
      region: doc.region,
      aliases: doc.aliases,
    },
  };
}

/**
 * Which Igla units fit a vehicle. Shares the exact code path the dealer portal
 * uses, so an agent can never quote different advice than the portal shows an
 * installer looking at the same car.
 */
async function runCompatibility(args: Record<string, unknown>) {
  const make = str(args.make);
  const model = str(args.model);
  const year = num(args.year);

  const makeAltGuideIds = make ? await loadGuideIdsForAltMake(make) : [];
  const where = buildCompatibilityWhere({
    make,
    year,
    makeExact: Boolean(make),
    makeAltGuideIds,
    visibleOnly: true,
  });

  const rawRows = await prisma.vehicleCompatibility.findMany({
    where,
    orderBy: [{ make: "asc" }, { model: "asc" }, { yearFrom: "asc" }],
    take: 100,
    select: {
      id: true,
      make: true,
      model: true,
      yearFrom: true,
      yearTo: true,
      iglaProducts: true,
      analogBlockRequired: true,
      analogBlockType: true,
      blockKind: true,
      dealerNotes: true,
      alarmMoreButtons: true,
      sourceGuideId: true,
      sourceGuideStatus: true,
    },
  });

  const aliases = model
    ? await loadGuideModelAliases(rawRows.map((r) => r.sourceGuideId))
    : new Map<string, string[]>();
  let rows = model ? rawRows.filter((r) => rowMatchesModel(r, model, aliases)) : rawRows;

  const live = await loadLiveGuideCompatInfo(rows.map((r) => r.sourceGuideId));
  rows = excludeHiddenCompatibilityRows(rows, live);

  const items = rows
    .map((r) => ({
      row: r,
      item: toPublicCompatibilityItem(
        r,
        r.sourceGuideId ? live.get(r.sourceGuideId)?.status ?? null : null,
      ),
    }))
    .filter(({ item }) => item.guidePublished);

  const units = [...new Set(items.flatMap(({ item }) => item.iglaProducts))];
  const recommendAlarm = items.some(({ item }) => item.recommendAlarm);

  return {
    vehicle: [year, make, model].filter(Boolean).join(" "),
    hasData: items.length > 0,
    compatibleUnits: units,
    recommendation: recommendAlarm ? ALARM_MORE_BUTTONS_NOTE : null,
    matches: items.map(({ row, item }) => ({
      make: item.make,
      model: item.model,
      modelDetail: item.modelDetail,
      years: item.yearsLabel,
      units: item.iglaProducts,
      blockingRequired: item.analogBlockRequired,
      blockingKind: item.blockKind,
      blockingType: item.analogBlockType,
      notes: item.dealerNotes,
      guideId: row.sourceGuideId,
      guideUrl: row.sourceGuideId ? guideUrl(row.sourceGuideId) : null,
    })),
  };
}

/** The vehicles that have a published guide at all — for "do we cover X?". */
async function runListVehicles(args: Record<string, unknown>) {
  const make = str(args.make);

  // Which guides are published is read LIVE and first — the index carries a
  // status snapshot, and gating on that would hide a guide published a moment
  // ago (or, worse, keep showing one just archived).
  const publishedIds = (
    await prisma.guild.findMany({ where: { status: "PUBLISHED" }, select: { id: true } })
  ).map((g) => g.id);
  if (!publishedIds.length) return { count: 0, vehicles: [] };

  const rows = await prisma.guideSearchDoc.findMany({
    where: {
      guildId: { in: publishedIds },
      ...(make
        ? {
            OR: [
              { make: { contains: make, mode: "insensitive" } },
              { aliases: { contains: make, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    distinct: ["guildId"],
    orderBy: [{ make: "asc" }, { model: "asc" }],
    take: 500,
    select: {
      guildId: true,
      guideTitle: true,
      make: true,
      model: true,
      years: true,
      product: true,
      aliases: true,
    },
  });

  return {
    count: rows.length,
    vehicles: rows.map((r) => ({
      guideId: r.guildId,
      title: r.guideTitle,
      make: r.make,
      model: r.model,
      years: r.years,
      product: r.product,
      alsoKnownAs: r.aliases ? r.aliases.split(" · ").filter(Boolean) : [],
      url: guideUrl(r.guildId),
    })),
  };
}

// ---------------------------------------------------------------------------

const searchProps = {
  query: { type: "string", description: "Natural-language question or keywords." },
  make: { type: "string", description: "Optional vehicle make filter, e.g. Toyota." },
  model: { type: "string", description: "Optional vehicle model filter, e.g. RAV4." },
  year: { type: "number", description: "Optional model year, e.g. 2024." },
  product: {
    type: "string",
    description: "Optional Igla unit filter, e.g. 'IGLA 231', 'Alarm', 'FD'.",
  },
  limit: {
    type: "number",
    description: `Max results (1–${SEARCH_LIMIT_MAX}, default ${SEARCH_LIMIT_DEFAULT}).`,
  },
} as const;

export const TOOLS: McpTool[] = [
  {
    name: "search",
    title: "Search Igla installation guides",
    description:
      "Search published Igla installation guides and return matching sections. " +
      "Use for any question about how to install, wire, configure or troubleshoot " +
      "an Igla unit in a specific vehicle. Returns result ids — pass one to `fetch` " +
      "to read the full guide.",
    inputSchema: {
      type: "object",
      properties: { query: searchProps.query },
      required: ["query"],
    },
    run: async (args) => ({ results: await runSearch(args) }),
  },
  {
    name: "fetch",
    title: "Read a full installation guide",
    description:
      "Retrieve the complete text of one installation guide by the id returned " +
      "from `search`. Use this before answering anything detailed — search returns " +
      "excerpts, this returns the whole guide.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Result id from `search`, or a guide id." },
      },
      required: ["id"],
    },
    run: async (args) => runFetch(str(args.id) ?? ""),
  },
  {
    name: "search_guides",
    title: "Search guides with vehicle filters",
    description:
      "Same as `search` but accepts make / model / year / product filters. Prefer " +
      "this when the vehicle is known — it removes guides for other cars before ranking.",
    inputSchema: {
      type: "object",
      properties: searchProps,
      required: ["query"],
    },
    run: async (args) => ({ results: await runSearch(args) }),
  },
  {
    name: "get_guide",
    title: "Get a guide by id",
    description:
      "Full text of one published guide, section by section, plus its vehicle " +
      "identity and the other names it is served under.",
    inputSchema: {
      type: "object",
      properties: {
        guideId: { type: "string", description: "Guide id, or a search result id." },
      },
      required: ["guideId"],
    },
    run: async (args) => {
      const doc = await getGuideDocument(str(args.guideId) ?? "");
      return doc ?? { error: "not_found" };
    },
  },
  {
    name: "check_compatibility",
    title: "Which Igla units fit a vehicle",
    description:
      "Given a make, model and year, return the Igla units that can be installed, " +
      "whether extra blocking is required, and any recommendation between units. " +
      "This is the same data the dealer portal shows an installer.",
    inputSchema: {
      type: "object",
      properties: {
        make: { type: "string", description: "Vehicle make, e.g. Dodge or Ram." },
        model: { type: "string", description: "Vehicle model, e.g. 1500." },
        year: { type: "number", description: "Model year, e.g. 2024." },
      },
      required: ["make", "model"],
    },
    run: runCompatibility,
  },
  {
    name: "list_vehicles",
    title: "List covered vehicles",
    description:
      "Every vehicle that has a published installation guide, optionally filtered " +
      "by make. Use to answer 'do you have a guide for X?'.",
    inputSchema: {
      type: "object",
      properties: {
        make: { type: "string", description: "Optional make filter." },
      },
    },
    run: runListVehicles,
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export const SERVER_INSTRUCTIONS =
  "Knowledge base of Igla Canada vehicle installation guides and unit compatibility. " +
  "For an installation or wiring question, call `search` (or `search_guides` when you " +
  "know the vehicle), then `fetch` the best result before answering — search returns " +
  "excerpts only. For 'which unit fits this car', call `check_compatibility`. " +
  "Answer only from what these tools return, and cite the guide title and vehicle. " +
  "Vehicles are often listed under more than one name (a RAM 1500 is filed under " +
  "Dodge); the tools already resolve those, so trust an empty result over guessing.";
