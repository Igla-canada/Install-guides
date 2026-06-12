// The auto-pull matching logic (§9 of the plan). Priority:
//   1. VIN decode → canonical make/model/year (clean identity, generation-level)
//   2. Free-text make/model normalized via vehicle_alias + fuzzy matching
//   3. Unit serial → inventory → product (required to pick among product guilds)
// Returns one published guild when unambiguous, otherwise a ranked candidate
// list for the installer to pick from (e.g. per-trim guilds).
import { prisma } from "./db";
import { decodeVin } from "./vin";
import { productFromSerial } from "./inventory";

export type ResolveInput = {
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
  product: string;
  productLine: string;
  confidence: "high" | "medium" | "low";
};

export type ResolveResult = {
  match: ResolveCandidate | null; // set when exactly one confident hit
  candidates: ResolveCandidate[]; // ranked alternatives (or all, when ambiguous)
  diagnostics: {
    vehicleSource: "vin" | "free_text" | "none";
    makeResolved: string | null;
    modelResolved: string | null;
    generationMatched: boolean;
    productResolved: string | null;
  };
};

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function resolveGuild(input: ResolveInput): Promise<ResolveResult> {
  // --- 1+2: vehicle identity ----------------------------------------------
  let makeText = input.make ?? null;
  let modelText = input.model ?? null;
  let year = input.year ?? null;
  let vehicleSource: "vin" | "free_text" | "none" = "none";

  if (input.vin) {
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

  // Resolve make: exact name (ci) → alias table.
  let make = makeText
    ? await prisma.make.findFirst({
        where: { name: { equals: makeText.trim(), mode: "insensitive" } },
      })
    : null;
  if (!make && makeText) {
    const alias = await prisma.vehicleAlias.findFirst({
      where: { aliasText: makeText.trim().toLowerCase(), modelId: null },
      include: { make: true },
    });
    make = alias?.make ?? null;
  }

  // Resolve model within the make: exact (ci) → alias → fuzzy normalized.
  let model =
    make && modelText
      ? await prisma.model.findFirst({
          where: {
            makeId: make.id,
            name: { equals: modelText.trim(), mode: "insensitive" },
          },
        })
      : null;
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

  // Year → generation range.
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

  // --- query published guilds ------------------------------------------------
  const guilds = await prisma.guild.findMany({
    where: {
      status: "PUBLISHED",
      ...(make ? { makeId: make.id } : {}),
      ...(model ? { modelId: model.id } : {}),
      ...(matchedGenerations.length > 0
        ? { generationId: { in: matchedGenerations.map((g) => g.id) } }
        : {}),
      ...(product ? { iglaProductId: product.id } : {}),
    },
    include: {
      make: true,
      model: true,
      generation: true,
      trim: true,
      iglaProduct: { include: { productLine: true } },
    },
    take: 10,
  });

  const baseConfidence: "high" | "medium" | "low" =
    vehicleSource === "vin" && model && year
      ? "high"
      : model
      ? "medium"
      : "low";

  const candidates: ResolveCandidate[] = guilds.map((g) => ({
    guildId: g.id,
    title: g.title,
    make: g.make.name,
    model: g.model.name,
    generation: g.generation.name,
    trim: g.trim?.name ?? null,
    product: g.iglaProduct.name,
    productLine: g.iglaProduct.productLine.name,
    confidence: baseConfidence,
  }));

  // Single confident hit only when the vehicle resolved to a model and, if
  // multiple guilds exist, the product disambiguated them.
  const match =
    candidates.length === 1 && model && matchedGenerations.length > 0
      ? candidates[0]
      : null;

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
