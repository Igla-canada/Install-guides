import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const PDFJS_PATH =
  "C:\\Users\\Ronen CSI\\Desktop\\GHOST GUIDES\\node_modules\\pdfjs-dist\\legacy\\build\\pdf.mjs";

async function extract(pdfPath: string) {
  const pdfjs = await import(pathToFileURL(PDFJS_PATH).href);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: { str: string }) => it.str).join(" ") + "\n";
  }
  return { pages: doc.numPages, text };
}

async function main() {
  const files = [
    "D:\\Ghost Guides Data\\downloads\\Toyota\\Highlander (U70) With Engine Stall (2020 - 2023).pdf",
    "D:\\Ghost Guides Data\\downloads\\Toyota\\Crown (S235) (2023).pdf",
  ];
  // find crown pdf if name differs
  const toyotaDir = "D:\\Ghost Guides Data\\downloads\\Toyota";
  const crown = fs
    .readdirSync(toyotaDir)
    .find((f) => /crown/i.test(f) && f.endsWith(".pdf"));
  if (crown) files[1] = path.join(toyotaDir, crown);

  for (const pdf of files) {
    if (!fs.existsSync(pdf)) {
      console.log("MISSING", pdf);
      continue;
    }
    const { pages, text } = await extract(pdf);
    const out = path.join(
      "D:\\Ghost Guides Data",
      `_audit-${path.basename(pdf, ".pdf").slice(0, 40).replace(/[^\w]+/g, "_")}.txt`
    );
    fs.writeFileSync(out, text);
    const flat = text.replace(/\s+/g, " ");
    console.log("\n====", path.basename(pdf), "pages", pages, "chars", text.length);
    console.log("FAMILY", flat.match(/FAMILY\s*FILE\s+([A-Za-z0-9_+\-.]+)/i)?.[1]);
    console.log("has IMPORTANT NOTES", /IMPORTANT NOTES/i.test(flat));
    console.log("has CONNECTION NOTES", /CONNECTION NOTES/i.test(flat));
    console.log("has Wires:", /Wires:/i.test(flat));
    console.log("wire pattern count", (flat.match(/\[[^\]]+\]:\s*Ghost/gi) || []).length);
    console.log("alt wire patterns:", {
      ghostColon: (flat.match(/Ghost\s+[A-Za-z-]+:/gi) || []).length,
      canHigh: /CAN[- ]?H/i.test(flat),
      connectionPoint: /Connection point:/i.test(flat),
    });
    console.log("--- first 2000 chars ---");
    console.log(flat.slice(0, 2000));
    console.log("--- around IMPORTANT / Wires ---");
    const idx = flat.search(/IMPORTANT NOTES|Wires:|CONNECTION NOTES|Connection point/i);
    console.log(idx >= 0 ? flat.slice(Math.max(0, idx - 100), idx + 1500) : "(not found)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
