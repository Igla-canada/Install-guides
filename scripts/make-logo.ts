/**
 * Turn the brand logo into a transparent-background asset set.
 *
 * Usage: drop the source image at public/logo-source.png (or pass a path), then
 *   npx tsx scripts/make-logo.ts [sourcePath]
 *
 * It removes the (near-)white background, trims the margins, and writes:
 *   public/logo.png            — transparent, ≤512px wide (login page, in-app)
 *   public/icon-192.png        — PWA icon (manifest)
 *   public/icon-512.png        — PWA icon (manifest, incl. maskable)
 *   public/apple-touch-icon.png— iOS home-screen icon (180²)
 *   src/app/icon.png           — browser favicon (Next auto-detects, 256²)
 *   src/app/apple-icon.png     — Apple icon (Next auto-detects, 180²)
 *
 * White-removal: a pixel only goes transparent when ALL channels are very high
 * (true white). Light-cyan logo strokes have a low red channel, so they're kept.
 */
import sharp from "sharp";

const SRC = process.argv[2] ?? "public/logo-source.png";

async function transparentBuffer(): Promise<Buffer> {
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 4 after ensureAlpha
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 232 && g > 232 && b > 232) {
      // 232 → keep, ≥244 (near/true white) → fully transparent, feather between.
      // Gating on all channels protects light-cyan strokes (their red is low).
      const minc = Math.min(r, g, b);
      const t = Math.min(1, (minc - 232) / 12);
      data[i + 3] = Math.round(data[i + 3] * (1 - t));
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .trim()
    .toBuffer();
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const square = (buf: Buffer, size: number, out: string) =>
  sharp(buf)
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .png()
    .toFile(out);

(async () => {
  const logo = await transparentBuffer();
  await sharp(logo).resize({ width: 512, withoutEnlargement: true }).png().toFile("public/logo.png");
  await square(logo, 192, "public/icon-192.png");
  await square(logo, 512, "public/icon-512.png");
  await square(logo, 180, "public/apple-touch-icon.png");
  await square(logo, 256, "src/app/icon.png");
  await square(logo, 180, "src/app/apple-icon.png");
  console.log("✓ logo assets written (transparent background).");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
