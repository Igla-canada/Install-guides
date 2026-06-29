// The auto-pull matching logic (§9 of the plan). Priority:
//   1. VIN decode → canonical make/model/year (clean identity, generation-level)
//   2. Free-text make/model normalized via vehicle_alias + fuzzy matching
//   3. Unit serial → inventory → product (required to pick among product guilds)
// Returns one published guild when unambiguous, otherwise a ranked candidate
// list for the installer to pick from (e.g. per-trim guilds).
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { decodeVin } from "./vin";
import { productFromSerial } from "./inventory";

export type ResolveInput = {
  // Exact ids from the portal's dropdowns (fed by GET /api/taxonomy) — the
  // deterministic path, takes precedence over everything else.
  makeId?: string;
  modelId?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  serial?: string;
};

export type ResolveCandidate = {
  guildId: string;
  title: string;
  make: string;
  model: string;
  generation: string;
  trim: string | null;
  product: string; // primary product (display/back-compat)
  productLine: string; // primary product's line
  products: string[]; // every product this guide covers
  productLines: string[]; // distinct lines across those products
  confidence: "high" | "medium" | "low";
};

export type ResolveResult = {
  match: ResolveCandidate | null; // set when exactly one confident hit
  candidates: ResolveCandidate[]; // ranked alternatives (or all, when ambiguous)
  diagnostics: {
    vehicleSource: "ids" | "vin" | "free_text" | "none";
    makeResolved: string | null;
    modelResolved: string | null;
    generationMatched: boolean;
    productResolved: string | null;
  };
};

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function resolveGuild(input: ResolveInput): Promise<ResolveResult> {
  // --- 0: exact dropdown ids (portal fed by /api/taxonomy) ------------------
  let makeText = input.make ?? null;
  let modelText = input.model ?? null;
  let year = input.year ?? null;
  let vehicleSource: "ids" | "vin" | "free_text" | "none" = "none";

  let makeById = input.makeId
    ? await prisma.make.findUnique({ where: { id: input.makeId } })
    : null;
  let modelById =
    input.modelId && makeById
      ? await prisma.model.findUnique({ where: { id: input.modelId } })
      : null;
  if (modelById && modelById.makeId !== makeById?.id) modelById = null;
  if (makeById) vehicleSource = "ids";

  if (!makeById && input.vin) {
    const decoded = await decodeVin(input.vin);
    if (decoded?.make) {
      makeText = decoded.make;
      modelText = decoded.model ?? modelText;
      year = decoded.year ?? year;
      vehicleSource = "vin";
    }
  }
  if (vehicleSource === "none" && (makeText || modelText)) {
    vehicleSource = "free_text";
  }

  // Resolve make: exact id → exact name (ci) → alias table.
  let make =
    makeById ??
    (makeText
      ? await prisma.make.findFirst({
          where: { name: { equals: makeText.trim(), mode: "insensitive" } },
        })
      : null);
  if (!make && makeText) {
    const alias = await prisma.vehicleAlias.findFirst({
      where: { aliasText: makeText.trim().toLowerCase(), modelId: null },
      include: { make: true },
    });
    make = alias?.make ?? null;
  }

  // Resolve model within the make: exact id → exact (ci) → alias → fuzzy.
  let model =
    modelById ??
    (make && modelText
      ? await prisma.model.findFirst({
          where: {
            makeId: make.id,
            name: { equals: modelText.trim(), mode: "insensitive" },
          },
        })
      : null);
  if (!model && make && modelText) {
    const alias = await prisma.vehicleAlias.findFirst({
      where: {
        makeId: make.id,
        aliasText: modelText.trim().toLowerCase(),
        modelId: { not: null },
      },
      include: { model: true },
    });
    model = alias?.model ?? null;
  }
  if (!model && make && modelText) {
    const all = await prisma.model.findMany({ where: { makeId: make.id } });
    const target = normalize(modelText);
    model =
      all.find((m) => normalize(m.name) === target) ??
      all.find(
        (m) =>
          normalize(m.name).includes(target) || target.includes(normalize(m.name))
      ) ??
      null;
  }

  // Did the caller name a make/model we couldn't resolve? Tracked so the
  // primary query never falls through to an unfiltered make dump ("no guide for
  // this model" must mean none). A model that didn't resolve under the make can
  // still hit the BRIDGE path below (e.g. "Dodge Ram 1500" → a RAM 1500 guide).
  const makeUnresolved = Boolean(makeText && makeText.trim()) && !make;
  const modelUnresolved = Boolean(make && modelText && modelText.trim()) && !model;

  // Year → generation range (kept for diagnostics only; the actual year filter below uses
  // each guild's OWN generation, which is authoritative even if a guild's generation row was
  // mistakenly attached under a sibling model).
  const generations =
    model != null
      ? await prisma.generation.findMany({ where: { modelId: model.id } })
      : [];
  const matchedGenerations = year
    ? generations.filter(
        (g) => g.yearStart <= year! && year! <= (g.yearEnd ?? 9999)
      )
    : generations;

  // --- 3: product -----------------------------------------------------------
  const product = input.serial ? await productFromSerial(input.serial) : null;

  const include = {
    make: true,
    model: true,
    generation: true,
    trim: true,
    iglaProduct: { include: { productLine: true } },
    products: { include: { iglaProduct: { include: { productLine: true } } } },
  } satisfies Prisma.GuildInclude;

  // Primary path: guides whose OWN make (and model, when a model name was given
  // and resolved) match. Skipped when a model name was given but didn't resolve
  // — querying by make alone would wrongly return every guide for that make.
  const primaryGuilds =
    make && !makeUnresolved && !modelUnresolved
      ? await prisma.guild.findMany({
          where: {
            status: "PUBLISHED",
            makeId: make.id,
            ...(model ? { modelId: model.id } : {}),
            // A guide covers a SET of products — match if the resolved product is in it.
            ...(product ? { products: { some: { iglaProductId: product.id } } } : {}),
          },
          include,
          take: 10,
        })
      : [];

  // Bridge path: guides authored under a DIFFERENT make but declared valid for
  // THIS make (a RAM 1500 guide bridged to "Dodge"). Their model row lives under
  // their own make, so match the model by NAME against the requested text
  // (or take all bridged guides when no model text was given).
  const target = modelText ? normalize(modelText.trim()) : null;
  const bridgeGuilds = make
    ? (
        await prisma.guild.findMany({
          where: {
            status: "PUBLISHED",
            altMakes: { some: { makeId: make.id } },
            ...(product ? { products: { some: { iglaProductId: product.id } } } : {}),
          },
          include,
          take: 10,
        })
      ).filter((g) => {
        if (!target) return true;
        const n = normalize(g.model.name);
        return n === target || n.includes(target) || target.includes(n);
      })
    : [];

  // Merge (primary first), de-dupe by id.
  const seen = new Set<string>();
  const allGuilds = [...primaryGuilds, ...bridgeGuilds].filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });

  // Keep guilds whose own generation covers the requested model-year.
  const guilds = year
    ? allGuilds.filter(
        (g) => g.generation.yearStart <= year! && year! <= (g.generation.yearEnd ?? 9999)
      )
    : allGuilds;

  const baseConfidence: "high" | "medium" | "low" =
    (vehicleSource === "ids" || vehicleSource === "vin") && model && year
      ? "high"
      : model
      ? "medium"
      : "low";

  const candidates: ResolveCandidate[] = guilds.map((g) => {
    const productNames = g.products.map((p) => p.iglaProduct.name);
    const lineNames = [...new Set(g.products.map((p) => p.iglaProduct.productLine.name))];
    return {
      guildId: g.id,
      title: g.title,
      make: g.make.name,
      model: g.model.name,
      generation: g.generation.name,
      trim: g.trim?.name ?? null,
      product: g.iglaProduct.name,
      productLine: g.iglaProduct.productLine.name,
      products: productNames.length ? productNames : [g.iglaProduct.name],
      productLines: lineNames.length ? lineNames : [g.iglaProduct.productLine.name],
      confidence: baseConfidence,
    };
  });

  // Single confident hit when exactly one published guide survived filtering and
  // the vehicle pinned a model — either a resolved Model row (primary path) or a
  // model name we matched against a bridged guide (target).
  const match = candidates.length === 1 && (model != null || target != null) ? candidates[0] : null;

  return {
    match,
    candidates,
    diagnostics: {
      vehicleSource,
      makeResolved: make?.name ?? null,
      modelResolved: model?.name ?? null,
      generationMatched: matchedGenerations.length > 0 && Boolean(year),
      productResolved: product
        ? `${product.productLine.name} ${product.name}`
        : null,
    },
  };
}
