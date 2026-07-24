import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const PDFJS =
  process.env.PDFJS_PATH ??
  "C:\\Users\\Ronen CSI\\Desktop\\GHOST GUIDES\\node_modules\\pdfjs-dist\\legacy\\build\\pdf.mjs";

const pdfPath =
  process.argv[2] ||
  "D:\\Ghost Guides Data\\downloads\\Toyota\\Highlander (U70) With Engine Stall (2020 - 2023).pdf";

async function main() {
  const pdfjs = await import(pathToFileURL(PDFJS).href);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += `\n===== PAGE ${i} =====\n`;
    text += content.items.map((it: { str: string }) => it.str).join(" ") + "\n";
  }
  const out = path.join("D:\\Ghost Guides Data", "_pdf-dump-highlander.txt");
  fs.writeFileSync(out, text);
  console.log("pages", doc.numPages, "chars", text.length, "->", out);
  // show key sections
  const flat = text.replace(/\s+/g, " ");
  for (const label of [
    "FAMILY FILE",
    "IMPORTANT NOTES",
    "CONNECTION NOTES",
    "REQUIRED FEATURE",
    "OPTIONAL FEATURES",
    "Connection point",
    "Wires:",
    "Button List",
    "[CAN",
    "[12V",
    "Ghost",
  ]) {
    const idx = flat.toLowerCase().indexOf(label.toLowerCase());
    console.log(label, idx >= 0 ? `at ${idx}: ...${flat.slice(idx, idx + 180)}...` : "NOT FOUND");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
