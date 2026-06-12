/**
 * Notion → Igla Guilds migration.
 *
 * Usage:
 *   $env:NOTION_TOKEN="ntn_…"; npx tsx --env-file=.env scripts/import-notion.ts <parent-page-id>
 *
 * Setup: create a Notion internal integration (notion.so/my-integrations),
 * share the "IGLA install guides" parent page with it, pass that page's id.
 *
 * What it does, per child page:
 *  - title → guild title; page cover + properties (Years, Fuel, Ignition
 *    Type, IGLA Type, Status, …) → the guild properties box
 *  - headings → sections (type inferred from the heading text: Connection
 *    location(s) / Connections / IGLA Settings / Software / Buttons and
 *    Indication / …)
 *  - paragraphs → text · bullets & to-dos → checklist · callouts → callout
 *  - tables → key/value table · dividers → divider
 *  - images → downloaded and re-uploaded to OUR storage → image blocks
 *    (Notion's labels are burned into the photos, so they import as-is; new
 *    photos get live annotations) · files (.bin) → file blocks
 *  - identity: make/model parsed from the title when possible, otherwise the
 *    guild lands under make "Unsorted" — fix in the editor's identity panel.
 *  - everything imports as DRAFT for review; nothing publishes automatically.
 *
 * Idempotent: pages whose title matches an existing guild are skipped.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";
import { s3, BUCKET, ensureBucket } from "../src/lib/s3";

const prisma = new PrismaClient();
const NOTION = "https://api.notion.com/v1";
const token = process.env.NOTION_TOKEN;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function notion(path: string): Promise<any> {
  const res = await fetch(`${NOTION}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
    },
  });
  if (!res.ok) throw new Error(`Notion ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function allChildren(blockId: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion(
      `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`
    );
    out.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return out;
}

const plain = (rich: any[] | undefined): string =>
  (rich ?? []).map((r) => r.plain_text ?? "").join("");

async function uploadToS3(url: string, hint: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "application/octet-stream";
    const ext = hint.split(".").pop()?.split("?")[0]?.slice(0, 5) || "bin";
    const s3Key = `notion-import/${randomBytes(10).toString("hex")}.${ext}`;
    await ensureBucket();
    await s3.send(
      new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: buf, ContentType: mime })
    );
    const asset = await prisma.imageAsset.create({ data: { s3Key, mime } });
    return asset.id;
  } catch (e) {
    console.warn(`  ! download failed (${hint}):`, (e as Error).message);
    return null;
  }
}

function sectionTypeFor(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("connection location") || t.includes("installation")) return "installation_point";
  if (t.includes("connection")) return "connections";
  if (t.includes("setting")) return "settings";
  if (t.includes("software")) return "software";
  if (t.includes("button") || t.includes("indication")) return "buttons_indications";
  if (t.includes("warning")) return "warning";
  return "custom";
}

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
      return prop.multi_select?.map((s: any) => s.name).join(" ") || null;
    case "date":
      return prop.date?.start ?? null;
    case "checkbox":
      return prop.checkbox ? "Yes" : "No";
    default:
      return null;
  }
}

type PendingBlock = { type: string; content: any };

async function blocksToContent(notionBlocks: any[]): Promise<{
  sections: Array<{ title: string; type: string; blocks: PendingBlock[] }>;
}> {
  const sections: Array<{ title: string; type: string; blocks: PendingBlock[] }> = [];
  let current: { title: string; type: string; blocks: PendingBlock[] } | null = null;
  let checklist: Array<{ text: string; checked: boolean }> | null = null;

  const ensureSection = () => {
    if (!current) {
      current = { title: "Overview", type: "custom", blocks: [] };
      sections.push(current);
    }
    return current;
  };
  const flushChecklist = () => {
    if (checklist && checklist.length && current) {
      current.blocks.push({ type: "checklist", content: { items: checklist } });
    }
    checklist = null;
  };

  const walk = async (blocks: any[]) => {
    for (const b of blocks) {
      const t = b.type;
      if (t === "heading_1" || t === "heading_2" || t === "heading_3") {
        flushChecklist();
        const title = plain(b[t]?.rich_text) || "Section";
        current = { title, type: sectionTypeFor(title), blocks: [] };
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
        if (text.trim()) {
          ensureSection().blocks.push({
            type: "callout",
            content: { style: "info", text },
          });
        }
      } else if (t === "quote" || t === "toggle") {
        const text = plain(b[t]?.rich_text);
        if (text.trim()) ensureSection().blocks.push({ type: "text", content: { text } });
        if (b.has_children) await walk(await allChildren(b.id));
      } else if (t === "image") {
        const url = b.image?.file?.url ?? b.image?.external?.url;
        if (url) {
          const assetId = await uploadToS3(url, "image.jpg");
          if (assetId) {
            ensureSection().blocks.push({
              type: "image",
              content: { imageAssetId: assetId, caption: plain(b.image?.caption) },
            });
          }
        }
      } else if (t === "file" || t === "pdf") {
        const f = b[t];
        const url = f?.file?.url ?? f?.external?.url;
        const name = f?.name ?? plain(f?.caption) ?? "file.bin";
        if (url) {
          const assetId = await uploadToS3(url, name);
          if (assetId) {
            ensureSection().blocks.push({
              type: "file",
              content: { assetId, name },
            });
          }
        }
      } else if (t === "divider") {
        ensureSection().blocks.push({ type: "divider", content: {} });
      } else if (t === "table") {
        const rows = await allChildren(b.id);
        const cells: string[][] = rows
          .map((r) => (r.table_row?.cells ?? []).map((c: any[]) => plain(c)))
          .filter((cs: string[]) => cs.some((x) => x.trim()));
        const header = cells[0]?.map((x) => x.toLowerCase()) ?? [];
        // The reference "IGLA Connections" tables → our connections_table block.
        if (header.some((h) => h.includes("location")) && header.some((h) => h.includes("color"))) {
          const col = (name: string) => header.findIndex((h) => h.includes(name));
          const iLoc = col("location"), iColor = col("color"), iPin = col("pin"), iNote = col("note");
          const connRows = cells.slice(1).map((cs) => ({
            name: cs[0] ?? "",
            location: iLoc >= 0 ? cs[iLoc] ?? "" : "",
            color: iColor >= 0 ? cs[iColor] ?? "" : "",
            pin: iPin >= 0 ? cs[iPin] ?? "" : "",
            note: iNote >= 0 ? cs[iNote] ?? "" : "",
          }));
          if (connRows.length) {
            ensureSection().blocks.push({
              type: "connections_table",
              content: { rows: connRows },
            });
          }
        } else {
          const kv = cells.map((cs) => ({
            key: cs[0] ?? "",
            value: cs.slice(1).filter(Boolean).join(" · "),
          }));
          if (kv.length) {
            ensureSection().blocks.push({ type: "key_value_table", content: { rows: kv } });
          }
        }
      } else if (t === "column_list" || t === "column" || t === "synced_block") {
        if (b.has_children) await walk(await allChildren(b.id));
      } else if (t === "child_page" || t === "child_database") {
        // nested pages are imported as their own guilds by the top-level loop
      } else if (b.has_children) {
        await walk(await allChildren(b.id));
      }
    }
    flushChecklist();
  };

  await walk(notionBlocks);
  return { sections };
}

function parseIdentity(title: string, yearsProp: string | null) {
  const yearMatch = (yearsProp ?? title).match(/(19|20)\d{2}/);
  const yearFrom = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
  const tokens = title.replace(/(19|20)\d{2}/g, "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return { makeName: tokens[0], modelName: tokens.slice(1).join(" "), yearFrom };
  }
  // Single-word titles (e.g. "Roma") — park under "Unsorted" for manual re-point.
  return { makeName: "Unsorted", modelName: title.trim() || "Unknown", yearFrom };
}

async function findOrCreateIdentity(makeName: string, modelName: string, yearFrom: number) {
  const make =
    (await prisma.make.findFirst({
      where: { name: { equals: makeName, mode: "insensitive" } },
    })) ?? (await prisma.make.create({ data: { name: makeName } }));
  const model =
    (await prisma.model.findFirst({
      where: { makeId: make.id, name: { equals: modelName, mode: "insensitive" } },
    })) ?? (await prisma.model.create({ data: { makeId: make.id, name: modelName } }));
  const generation =
    (await prisma.generation.findFirst({
      where: {
        modelId: model.id,
        yearStart: { lte: yearFrom },
        OR: [{ yearEnd: null }, { yearEnd: { gte: yearFrom } }],
      },
    })) ??
    (await prisma.generation.create({
      data: { modelId: model.id, name: `${yearFrom}+`, yearStart: yearFrom, yearEnd: null },
    }));
  return { make, model, generation };
}

async function pickProduct(iglaTypeProp: string | null) {
  const products = await prisma.iglaProduct.findMany({ include: { productLine: true } });
  if (iglaTypeProp) {
    const hit = products.find(
      (p) =>
        iglaTypeProp.toLowerCase().includes(p.name.toLowerCase()) ||
        (p.modelCode && iglaTypeProp.toLowerCase().includes(p.modelCode.toLowerCase())) ||
        p.name.toLowerCase().includes(iglaTypeProp.toLowerCase())
    );
    if (hit) return hit;
    // e.g. property "231 Alarm" → product containing "231"
    const num = iglaTypeProp.match(/\d{2,}/)?.[0];
    if (num) {
      const numHit = products.find((p) => p.name.includes(num));
      if (numHit) return numHit;
    }
  }
  return products.find((p) => p.productLine.name === "IGLA") ?? products[0];
}

async function importPage(pageId: string, admin: { id: string }) {
  const page = await notion(`/pages/${pageId}`);
  const titleProp = Object.values(page.properties ?? {}).find(
    (p: any) => p.type === "title"
  ) as any;
  const title = plain(titleProp?.title) || "Untitled";

  const existing = await prisma.guild.findFirst({ where: { title } });
  if (existing) {
    console.log(`- "${title}" already exists, skipping`);
    return;
  }
  console.log(`+ importing "${title}"…`);

  // Properties box
  const properties: Record<string, string> = {};
  for (const [name, prop] of Object.entries(page.properties ?? {})) {
    if ((prop as any).type === "title") continue;
    const v = propValue(prop);
    if (v) properties[name] = v;
  }

  const identity = parseIdentity(title, properties["Years"] ?? null);
  const { make, model, generation } = await findOrCreateIdentity(
    identity.makeName,
    identity.modelName,
    identity.yearFrom
  );
  const product = await pickProduct(properties["IGLA Type"] ?? null);
  if (!product) throw new Error("no products in catalog — seed first");
  const region = await prisma.region.findFirstOrThrow();

  // Cover image
  const coverUrl = page.cover?.file?.url ?? page.cover?.external?.url;
  const coverImageId = coverUrl ? await uploadToS3(coverUrl, "cover.jpg") : null;

  // Content
  const { sections } = await blocksToContent(await allChildren(pageId));

  const guild = await prisma.guild.create({
    data: {
      regionId: region.id,
      makeId: make.id,
      modelId: model.id,
      generationId: generation.id,
      iglaProductId: product.id,
      title,
      status: "DRAFT",
      coverImageId,
      properties: properties as Prisma.InputJsonValue,
      createdById: admin.id,
      updatedById: admin.id,
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
  const flag = identity.makeName === "Unsorted" ? "  → identity needs manual re-point!" : "";
  console.log(
    `  ✓ draft ${guild.id} (${make.name} ${model.name}, ${product.name}, ${sections.length} sections)${flag}`
  );
}

async function main() {
  if (!token) throw new Error("Set NOTION_TOKEN (notion.so/my-integrations)");
  const parentId = process.argv[2];
  if (!parentId) throw new Error("Usage: import-notion.ts <parent-page-id>");

  const admin = await prisma.userAccount.findFirstOrThrow({ where: { role: "ADMIN" } });
  const children = await allChildren(parentId.replace(/-/g, ""));

  const pageIds: string[] = [];
  for (const c of children) {
    if (c.type === "child_page") pageIds.push(c.id);
    if (c.type === "child_database") {
      let cursor: string | undefined;
      do {
        const res = await fetch(`${NOTION}/databases/${c.id}/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
        });
        const data = await res.json();
        pageIds.push(...(data.results ?? []).map((p: any) => p.id));
        cursor = data.has_more ? data.next_cursor : undefined;
      } while (cursor);
    }
  }
  console.log(`Found ${pageIds.length} pages to import.\n`);
  for (const id of pageIds) {
    try {
      await importPage(id, admin);
    } catch (e) {
      console.error(`  ✗ failed:`, (e as Error).message);
    }
  }
  console.log(
    "\nDone. All imports are DRAFTS — review each in the editor (👁 Preview), fix identity where flagged, then Publish."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
