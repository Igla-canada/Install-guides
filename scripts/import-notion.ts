/**
 * Notion → Igla Guides migration.
 *
 * The Notion workspace is organised three levels deep:
 *
 *   "IGLA install guides" (parent page)
 *     └── "Dodge", "BMW", … (one child page PER BRAND, page icon = logo)
 *           └── inline database ("Dodge Installation Guides")
 *                 └── one ROW per guide ("RAM 2500", …) → the guide page
 *
 * Each guide row carries identity as properties (Model, Years, Fuel, Ignition
 * Type, IGLA Type, Status, Version) and the install steps as page content
 * (headings, columns of photos, callouts, the IGLA Connections table, .bin
 * firmware files).
 *
 * Usage (token in .env as NOTION_TOKEN):
 *   # one guide — the test run
 *   npx tsx --env-file=.env scripts/import-notion.ts --page ba7916504d3241508a953cd93a016117
 *   # one whole brand
 *   npx tsx --env-file=.env scripts/import-notion.ts --brand e673a33979e14571aae77254f539c627
 *   # everything under the parent page
 *   npx tsx --env-file=.env scripts/import-notion.ts 5902ec37da3e41dcb732be25cf3b98eb
 *   # cap how many guides (handy for a bigger smoke test)
 *   npx tsx --env-file=.env scripts/import-notion.ts --brand <id> --limit 3
 *   # re-import even if a same-titled guild already exists under the make
 *   …  --force
 *
 * Mapping:
 *  - brand page  → Make (page icon → Make.logoUrl, inlined as a data URL)
 *  - row "Model" → Model · "Years" → Generation · "IGLA Type" (multi) →
 *    auto-created IglaProduct(s) under the "IGLA" line (guild FK = first value;
 *    the full list is kept in the properties box)
 *  - other props → the grey properties box
 *  - headings → sections (colour/type inferred from the heading text, then the
 *    Notion heading colour as a fallback)
 *  - paragraphs → text · bullets/to-dos → checklist · dividers → divider
 *  - column lists of photos → ONE gallery (preserves the side-by-side layout)
 *  - standalone photos → image blocks · captions kept
 *  - callout wrapping the Location/Color table → connections_table
 *  - callout wrapping a .bin → file block (callout label becomes the name)
 *  - other callouts (settings) → a single callout block (title + bullets folded in)
 *  - images & files → downloaded from Notion and re-uploaded to OUR S3
 *
 * Everything imports as DRAFT. Idempotent: a guide whose title already exists
 * under the same make is skipped (override with --force).
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";
import { s3, BUCKET, ensureBucket } from "../src/lib/s3";

const prisma = new PrismaClient();
const NOTION = "https://api.notion.com/v1";
const token = process.env.NOTION_TOKEN;

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Notion REST helpers
// ---------------------------------------------------------------------------

async function notion(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${NOTION}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Notion ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const retrievePage = (id: string) => notion(`/pages/${id.replace(/-/g, "")}`);
const retrieveDatabase = (id: string) => notion(`/databases/${id.replace(/-/g, "")}`);

async function allChildren(blockId: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion(
      `/blocks/${blockId.replace(/-/g, "")}/children?page_size=100${
        cursor ? `&start_cursor=${cursor}` : ""
      }`
    );
    out.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function queryDatabaseRows(databaseId: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion(`/databases/${databaseId.replace(/-/g, "")}/query`, {
      method: "POST",
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
    });
    out.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

const plain = (rich: any[] | undefined): string =>
  (rich ?? []).map((r) => r.plain_text ?? "").join("");

// ---------------------------------------------------------------------------
// Asset download → our S3
// ---------------------------------------------------------------------------

async function uploadAsset(
  url: string,
  hint: string
): Promise<{ assetId: string; size: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ! download ${res.status} (${hint})`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "application/octet-stream";
    const ext = hint.split(".").pop()?.split("?")[0]?.slice(0, 6) || "bin";
    const s3Key = `notion-import/${randomBytes(10).toString("hex")}.${ext}`;
    await ensureBucket();
    await s3.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: buf, ContentType: mime })
    );
    const asset = await prisma.imageAsset.create({ data: { s3Key, mime } });
    return { assetId: asset.id, size: buf.byteLength };
  } catch (e) {
    console.warn(`  ! download failed (${hint}):`, (e as Error).message);
    return null;
  }
}

/** Brand page icon → a stable logo string for Make.logoUrl (data URL or external link). */
async function iconToLogo(icon: any): Promise<string | null> {
  if (!icon) return null;
  if (icon.type === "external") return icon.external?.url ?? null;
  if (icon.type === "file") {
    try {
      const res = await fetch(icon.file.url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > 120_000) return null; // too big to inline — UI falls back to its CDN guess
      const mime = res.headers.get("content-type") ?? "image/png";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }
  return null; // emoji icons: leave null, the Guides menu draws a monogram/CDN logo
}

// ---------------------------------------------------------------------------
// Section typing (text first, Notion heading colour as fallback)
// ---------------------------------------------------------------------------

function sectionTypeFor(title: string, color?: string): string {
  const t = title.toLowerCase();
  if (t.includes("connection location") || t.includes("installation")) return "installation_point";
  if (t.includes("blocking") || t.includes("mandatory") || t.includes("required") || t.includes("warning"))
    return "warning";
  if (t.includes("connection")) return "connections";
  if (t.includes("setting")) return "settings";
  if (t.includes("software") || t.includes("firmware")) return "software";
  if (t.includes("button") || t.includes("indication")) return "buttons_indications";
  switch ((color ?? "").replace("_background", "_bg")) {
    case "green_bg":
      return "connections";
    case "blue_bg":
      return "settings";
    case "red_bg":
      return "software";
    case "yellow_bg":
    case "orange_bg":
      return "buttons_indications";
    case "purple_bg":
      return "software";
  }
  return "custom";
}

function calloutStyle(color?: string): "info" | "warning" | "danger" {
  const c = color ?? "";
  if (c.includes("red")) return "danger";
  if (c.includes("yellow") || c.includes("orange") || c.includes("brown")) return "warning";
  return "info";
}

// ---------------------------------------------------------------------------
// Property readers
// ---------------------------------------------------------------------------

function propValue(prop: any): string | null {
  switch (prop?.type) {
    case "title":
      return plain(prop.title) || null;
    case "rich_text":
      return plain(prop.rich_text) || null;
    case "number":
      return prop.number != null ? String(prop.number) : null;
    case "select":
      return prop.select?.name ?? null;
    case "status":
      return prop.status?.name ?? null;
    case "multi_select":
      return prop.multi_select?.map((s: any) => s.name).join(", ") || null;
    case "date":
      return prop.date?.start ?? null;
    case "checkbox":
      return prop.checkbox ? "Yes" : "No";
    default:
      return null;
  }
}

const multiValues = (prop: any): string[] =>
  prop?.type === "multi_select" ? prop.multi_select.map((s: any) => s.name) : [];

function titleOf(page: any): string {
  const titleProp = Object.values(page.properties ?? {}).find(
    (p: any) => p.type === "title"
  ) as any;
  return plain(titleProp?.title) || "Untitled";
}

// ---------------------------------------------------------------------------
// Content (Notion blocks → our sections/blocks)
// ---------------------------------------------------------------------------

type PendingBlock = { type: string; content: any };
type PendingSection = { title: string; type: string; blocks: PendingBlock[] };

/** Flatten a callout (its rich_text + bullet/paragraph children) into one text. */
async function flattenText(richText: string, children: any[]): Promise<string> {
  const lines: string[] = [];
  if (richText.trim()) lines.push(richText.trim());
  for (const c of children) {
    const t = c.type;
    if (t === "bulleted_list_item" || t === "numbered_list_item" || t === "to_do") {
      const txt = plain(c[t]?.rich_text);
      if (txt.trim()) lines.push(`• ${txt.trim()}`);
    } else if (t === "paragraph") {
      const txt = plain(c.paragraph?.rich_text);
      if (txt.trim()) lines.push(txt.trim());
    } else if (c.has_children) {
      lines.push(await flattenText("", await allChildren(c.id)));
    }
  }
  return lines.filter(Boolean).join("\n");
}

function tableToBlock(cells: string[][]): PendingBlock | null {
  const body = cells.filter((cs) => cs.some((x) => x.trim()));
  if (!body.length) return null;
  const header = body[0].map((x) => x.toLowerCase());
  // The reference "IGLA Connections" tables → connections_table.
  if (header.some((h) => h.includes("location")) && header.some((h) => h.includes("color"))) {
    const col = (name: string) => header.findIndex((h) => h.includes(name));
    const iLoc = col("location"), iColor = col("color"), iPin = col("pin"), iNote = col("note");
    const rows = body.slice(1).map((cs) => ({
      name: cs[0] ?? "",
      location: iLoc >= 0 ? cs[iLoc] ?? "" : "",
      color: iColor >= 0 ? cs[iColor] ?? "" : "",
      pin: iPin >= 0 ? cs[iPin] ?? "" : "",
      note: iNote >= 0 ? cs[iNote] ?? "" : "",
    }));
    return rows.length ? { type: "connections_table", content: { rows } } : null;
  }
  const rows = body.map((cs) => ({
    key: cs[0] ?? "",
    value: cs.slice(1).filter(Boolean).join(" · "),
  }));
  return { type: "key_value_table", content: { rows } };
}

async function blocksToContent(notionBlocks: any[]): Promise<PendingSection[]> {
  const sections: PendingSection[] = [];
  let current: PendingSection | null = null;
  let checklist: Array<{ text: string; checked: boolean }> | null = null;

  const ensureSection = () => {
    if (!current) {
      current = { title: "Overview", type: "custom", blocks: [] };
      sections.push(current);
    }
    return current;
  };
  const flushChecklist = () => {
    if (checklist && checklist.length) {
      ensureSection().blocks.push({ type: "checklist", content: { items: checklist } });
    }
    checklist = null;
  };

  const fileBlockFrom = async (b: any, labelPrefix?: string): Promise<PendingBlock | null> => {
    const f = b[b.type];
    const url = f?.file?.url ?? f?.external?.url;
    if (!url) return null;
    const fname =
      f?.name ||
      plain(f?.caption) ||
      decodeURIComponent(url.split("?")[0].split("/").pop() ?? "") ||
      "file.bin";
    const up = await uploadAsset(url, fname);
    if (!up) return null;
    // file+text block: the callout label (e.g. "231: Stable version") becomes
    // the description, the .bin keeps its own filename.
    return {
      type: "file_text",
      content: { text: labelPrefix ?? "", assetId: up.assetId, name: fname, size: up.size },
    };
  };

  const imageItem = async (b: any): Promise<{ imageAssetId: string; caption?: string } | null> => {
    const url = b.image?.file?.url ?? b.image?.external?.url;
    if (!url) return null;
    const up = await uploadAsset(url, "image.jpg");
    if (!up) return null;
    const caption = plain(b.image?.caption) || undefined;
    return { imageAssetId: up.assetId, caption };
  };

  const walk = async (blocks: any[]) => {
    for (const b of blocks) {
      const t = b.type;

      if (t === "heading_1" || t === "heading_2" || t === "heading_3") {
        flushChecklist();
        const title = plain(b[t]?.rich_text) || "Section";
        current = { title, type: sectionTypeFor(title, b[t]?.color), blocks: [] };
        sections.push(current);
        continue;
      }

      if (t === "bulleted_list_item" || t === "numbered_list_item" || t === "to_do") {
        ensureSection();
        checklist ??= [];
        checklist.push({
          text: plain(b[t]?.rich_text),
          checked: t === "to_do" ? Boolean(b.to_do?.checked) : false,
        });
        continue;
      }
      flushChecklist();

      if (t === "paragraph") {
        const text = plain(b.paragraph?.rich_text);
        if (text.trim()) ensureSection().blocks.push({ type: "text", content: { text } });
      } else if (t === "callout") {
        const text = plain(b.callout?.rich_text);
        const kids = b.has_children ? await allChildren(b.id) : [];
        const tableKids = kids.filter((k) => k.type === "table");
        const fileKids = kids.filter((k) => k.type === "file" || k.type === "pdf");
        if (tableKids.length) {
          // e.g. the "IGLA Connections" callout — emit the table, drop the label.
          for (const tk of tableKids) {
            const rows = await allChildren(tk.id);
            const cells = rows.map((r) => (r.table_row?.cells ?? []).map((c: any[]) => plain(c)));
            const blk = tableToBlock(cells);
            if (blk) ensureSection().blocks.push(blk);
          }
        } else if (fileKids.length) {
          // e.g. "231: Stable version" callout wrapping a .bin.
          const label = text.trim() || undefined;
          for (const fk of fileKids) {
            const blk = await fileBlockFrom(fk, label);
            if (blk) ensureSection().blocks.push(blk);
          }
        } else {
          // settings-style callout: fold title + bullet children into one block.
          const folded = await flattenText(text, kids);
          if (folded.trim()) {
            ensureSection().blocks.push({
              type: "callout",
              content: { style: calloutStyle(b.callout?.color), text: folded },
            });
          }
        }
      } else if (t === "quote" || t === "toggle") {
        const text = plain(b[t]?.rich_text);
        if (text.trim()) ensureSection().blocks.push({ type: "text", content: { text } });
        if (b.has_children) await walk(await allChildren(b.id));
      } else if (t === "image") {
        // A lone photo → a 1-item gallery (the single, annotatable photo block).
        const item = await imageItem(b);
        if (item) {
          ensureSection().blocks.push({
            type: "gallery",
            content: { items: [item], columns: 1 },
          });
        }
      } else if (t === "file" || t === "pdf") {
        const blk = await fileBlockFrom(b);
        if (blk) ensureSection().blocks.push(blk);
      } else if (t === "divider") {
        ensureSection().blocks.push({ type: "divider", content: {} });
      } else if (t === "table") {
        const rows = await allChildren(b.id);
        const cells = rows.map((r) => (r.table_row?.cells ?? []).map((c: any[]) => plain(c)));
        const blk = tableToBlock(cells);
        if (blk) ensureSection().blocks.push(blk);
      } else if (t === "column_list") {
        // Columns of photos → one gallery (keep the side-by-side layout). Any
        // non-image content inside the columns is walked normally afterwards.
        const cols = await allChildren(b.id);
        const items: Array<{ imageAssetId: string; caption?: string }> = [];
        const others: any[] = [];
        for (const col of cols) {
          const kids = col.has_children ? await allChildren(col.id) : [];
          for (const k of kids) {
            if (k.type === "image") {
              const item = await imageItem(k);
              if (item) items.push(item);
            } else if (k.type !== "column" && (k.type !== "paragraph" || plain(k.paragraph?.rich_text).trim())) {
              others.push(k);
            }
          }
        }
        if (items.length) {
          const columns = Math.min(Math.max(cols.length, 1), 4);
          ensureSection().blocks.push({ type: "gallery", content: { items, columns } });
        }
        if (others.length) await walk(others);
      } else if (t === "column" || t === "synced_block") {
        if (b.has_children) await walk(await allChildren(b.id));
      } else if (t === "child_page" || t === "child_database") {
        // handled by the brand/database walk, never inline
      } else if (b.has_children) {
        await walk(await allChildren(b.id));
      }
    }
    flushChecklist();
  };

  await walk(notionBlocks);
  return sections;
}

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

async function findOrCreateMake(name: string, logo: string | null) {
  const existing = await prisma.make.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    if (logo && !existing.logoUrl) {
      await prisma.make.update({ where: { id: existing.id }, data: { logoUrl: logo } });
    }
    return existing;
  }
  return prisma.make.create({ data: { name, logoUrl: logo ?? undefined } });
}

function yearFromYears(years: string | null, title: string): number {
  const m = (years ?? title).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : new Date().getFullYear();
}

async function findOrCreateModelGen(
  makeId: string,
  modelName: string,
  years: string | null,
  yearFrom: number
) {
  const model =
    (await prisma.model.findFirst({
      where: { makeId, name: { equals: modelName, mode: "insensitive" } },
    })) ?? (await prisma.model.create({ data: { makeId, name: modelName } }));
  // One generation per distinct "Years" value, matched by exact name only. A
  // year-range fallback would fold a later open-ended generation (yearEnd null)
  // into an earlier one and silently drop distinct guides (e.g. MDX 2025- into
  // MDX 2021-2024).
  const genName = (years ?? "").trim() || `${yearFrom}+`;
  const nums = (years ?? "").match(/(19|20)\d{2}/g) ?? [];
  const yearStart = nums[0] ? parseInt(nums[0], 10) : yearFrom;
  const yearEnd = nums[1] ? parseInt(nums[1], 10) : null;
  const generation =
    (await prisma.generation.findFirst({
      where: { modelId: model.id, name: genName },
    })) ??
    (await prisma.generation.create({
      data: { modelId: model.id, name: genName, yearStart, yearEnd },
    }));
  return { model, generation };
}

let iglaLineId: string | null = null;
async function iglaProductLine() {
  if (iglaLineId) return iglaLineId;
  const line =
    (await prisma.productLine.findFirst({ where: { name: "IGLA" } })) ??
    (await prisma.productLine.create({ data: { name: "IGLA" } }));
  iglaLineId = line.id;
  return line.id;
}

/** Auto-create one IglaProduct per distinct IGLA Type value; return them (first = primary). */
async function ensureProducts(types: string[]) {
  const lineId = await iglaProductLine();
  const names = types.length ? types : ["IGLA"];
  const products = [];
  for (const name of names) {
    const p =
      (await prisma.iglaProduct.findFirst({
        where: { productLineId: lineId, name: { equals: name, mode: "insensitive" } },
      })) ??
      (await prisma.iglaProduct.create({ data: { productLineId: lineId, name } }));
    products.push(p);
  }
  return products;
}

// ---------------------------------------------------------------------------
// Import one guide row → one DRAFT guild
// ---------------------------------------------------------------------------

async function importGuildRow(
  page: any,
  brand: { name: string; logo: string | null },
  admin: { id: string },
  force: boolean
): Promise<boolean> {
  const title = titleOf(page);
  if (title === "Untitled") {
    console.log(`  - blank row under ${brand.name}, skipping`);
    return false;
  }
  const make = await findOrCreateMake(brand.name, brand.logo);

  // Properties box (everything except the title property).
  const properties: Record<string, string> = {};
  for (const [name, prop] of Object.entries(page.properties ?? {})) {
    if ((prop as any).type === "title") continue;
    const v = propValue(prop);
    if (v) properties[name] = v;
  }

  const iglaTypes = multiValues((page.properties ?? {})["IGLA Type"]);
  const modelName = properties["Model"] || title;
  const years = properties["Years"] ?? null;
  const yearFrom = yearFromYears(years, title);

  const { model, generation } = await findOrCreateModelGen(make.id, modelName, years, yearFrom);
  const products = await ensureProducts(iglaTypes);

  // Idempotent on the FULL identity (make + title + generation + product) so a
  // model that repeats across generations/products isn't collapsed into one.
  if (!force) {
    const existing = await prisma.guild.findFirst({
      where: {
        makeId: make.id,
        title,
        generationId: generation.id,
        iglaProductId: products[0].id,
      },
    });
    if (existing) {
      console.log(`  - "${brand.name} / ${title}" (${generation.name}) already exists, skipping`);
      return false;
    }
  }
  console.log(`  + importing "${brand.name} / ${title}" (${generation.name})…`);
  const region =
    (await prisma.region.findFirst()) ??
    (await prisma.region.create({ data: { name: "North America" } }));

  // Cover (row pages rarely have one, but honour it if present).
  const coverUrl = page.cover?.file?.url ?? page.cover?.external?.url;
  const cover = coverUrl ? await uploadAsset(coverUrl, "cover.jpg") : null;

  const sections = await blocksToContent(await allChildren(page.id));

  const guild = await prisma.guild.create({
    data: {
      regionId: region.id,
      makeId: make.id,
      modelId: model.id,
      generationId: generation.id,
      iglaProductId: products[0].id,
      title,
      status: "DRAFT",
      coverImageId: cover?.assetId ?? null,
      properties: properties as Prisma.InputJsonValue,
      createdById: admin.id,
      updatedById: admin.id,
      // A guide covers every IGLA Type it was tagged with (resolver matches the set).
      products: { create: products.map((p) => ({ iglaProductId: p.id })) },
      sections: {
        create: sections.map((s, i) => ({
          order: i,
          title: s.title,
          type: s.type,
          blocks: {
            create: s.blocks.map((b, j) => ({
              order: j,
              type: b.type,
              content: b.content as Prisma.InputJsonValue,
            })),
          },
        })),
      },
    },
  });

  const blockCount = sections.reduce((n, s) => n + s.blocks.length, 0);
  console.log(
    `    ✓ draft ${guild.id} — ${make.name} ${model.name} (${generation.name}), product ${products
      .map((p) => p.name)
      .join("+")}, ${sections.length} sections / ${blockCount} blocks`
  );
  return true;
}

// ---------------------------------------------------------------------------
// Brand / database walk
// ---------------------------------------------------------------------------

async function brandFromPage(brandPage: any): Promise<{ name: string; logo: string | null }> {
  return { name: titleOf(brandPage), logo: await iconToLogo(brandPage.icon) };
}

/** Every guide-row page inside a brand page's inline database(s). */
async function rowsUnderBrand(brandPageId: string): Promise<any[]> {
  const children = await allChildren(brandPageId);
  const dbIds = children.filter((c) => c.type === "child_database").map((c) => c.id);
  const rows: any[] = [];
  for (const dbId of dbIds) rows.push(...(await queryDatabaseRows(dbId)));
  return rows;
}

async function resolveBrandForDatabaseId(
  databaseId: string
): Promise<{ name: string; logo: string | null }> {
  try {
    const db = await retrieveDatabase(databaseId);
    const brandPageId = db.parent?.page_id;
    if (brandPageId) return brandFromPage(await retrievePage(brandPageId));
  } catch {
    /* fall through */
  }
  return { name: "Unsorted", logo: null };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!token) {
    throw new Error(
      "Set NOTION_TOKEN in .env (the 'Igla Guides Migration' integration's secret from notion.so/my-integrations)."
    );
  }
  const force = process.argv.includes("--force");
  const limitArg = getArg("--limit");
  const limit = limitArg ? parseInt(limitArg, 10) : Infinity;
  const pageId = getArg("--page");
  const brandId = getArg("--brand");
  const parentId = process.argv.find(
    (a, i) => i >= 2 && !a.startsWith("--") && process.argv[i - 1] !== "--limit"
  );

  const admin = await prisma.userAccount.findFirstOrThrow({ where: { role: "ADMIN" } });

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const safeImport = async (
    row: any,
    brand: { name: string; logo: string | null }
  ) => {
    if (imported >= limit) return;
    try {
      if (await importGuildRow(row, brand, admin, force)) imported++;
      else skipped++;
    } catch (e) {
      failed++;
      console.error(`    ✗ failed "${brand.name} / ${titleOf(row)}":`, (e as Error).message);
    }
  };

  if (pageId) {
    // ---- single guide (the test run) ----
    const page = await retrievePage(pageId);
    const dbId = page.parent?.database_id;
    const brand = dbId
      ? await resolveBrandForDatabaseId(dbId)
      : { name: "Unsorted", logo: null };
    console.log(`Single guide: ${brand.name} / ${titleOf(page)}\n`);
    await safeImport(page, brand);
  } else if (brandId) {
    // ---- one brand ----
    const brandPage = await retrievePage(brandId);
    const brand = await brandFromPage(brandPage);
    const rows = await rowsUnderBrand(brandId);
    console.log(`Brand "${brand.name}": ${rows.length} guides (importing ${Math.min(rows.length, limit)}).\n`);
    for (const row of rows) await safeImport(row, brand);
  } else if (parentId) {
    // ---- everything under the parent page ----
    const brandPages = (await allChildren(parentId)).filter((c) => c.type === "child_page");
    console.log(`Parent page: ${brandPages.length} candidate brand pages.\n`);
    for (const bp of brandPages) {
      if (imported >= limit) break;
      const rows = await rowsUnderBrand(bp.id);
      if (!rows.length) continue; // not a brand (no database) — ToDo/Archive/etc.
      const brand = await brandFromPage(await retrievePage(bp.id));
      console.log(`# ${brand.name} — ${rows.length} guides`);
      for (const row of rows) {
        await safeImport(row, brand);
        if (imported >= limit) break;
      }
    }
  } else {
    throw new Error(
      "Usage: import-notion.ts <parentPageId> | --brand <brandPageId> | --page <guidePageId> [--limit N] [--force]"
    );
  }

  console.log(
    `\nDone — ${imported} imported, ${skipped} already existed${failed ? `, ${failed} failed` : ""}. ` +
      `All new guides are DRAFTS — review in the editor (Preview), fix identity/products where needed, then Publish.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
